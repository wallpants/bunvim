import { type Socket } from "bun";
import { pack, unpack } from "msgpackr";
import { EventEmitter } from "node:events";
import { type ApiInfo } from "./generated-api-info.ts";

enum MessageType {
    REQUEST = 0,
    RESPONSE = 1,
    NOTIFY = 2,
}

type RPCMessage =
    | [MessageType.REQUEST, id: number, method: string, args: unknown[]]
    | [MessageType.RESPONSE, id: number, error: Error | null, response: unknown]
    | [MessageType.NOTIFY, eventName: string, args: unknown[]];

export async function attach<
    EventsMap extends Record<string, unknown[]> = Record<string, unknown[]>,
>({ socket }: { socket: string }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const notificationHandlers = new Map<string, (args: any) => void | Promise<void>>();
    const emitter = new EventEmitter({ captureRejections: true });
    const messageOutQueue: RPCMessage[] = [];

    let lastReqId = 0;
    let awaitingResponse = false;

    function processRequestQueue(socket: Socket) {
        if (!messageOutQueue.length || awaitingResponse) return;
        awaitingResponse = true;
        socket.write(pack(messageOutQueue.shift()));
    }

    const nvimSocket = await Bun.connect({
        unix: socket,
        socket: {
            data(socket, data) {
                const message = unpack(data) as RPCMessage;
                if (message[0] === MessageType.NOTIFY) {
                    const catchAllHander = notificationHandlers.get("*");
                    void catchAllHander?.(message[2]);

                    const notificationHandler = notificationHandlers.get(message[1]);
                    void notificationHandler?.(message[2]);
                }

                if (message[0] === MessageType.RESPONSE) {
                    emitter.emit(`response-${message[1]}`, message[2], message[3]);
                    awaitingResponse = false;
                }

                if (messageOutQueue.length) {
                    processRequestQueue(socket);
                }
            },
        },
    });

    return {
        /**
         * Call a neovim function
         * @see {@link https://neovim.io/doc/user/api.html}
         *
         * @param func - function name
         * @param params - function params
         *
         * @example
         * ```ts
         * const lineCount = await nvim.call("nvim_buf_line_count", [0]);
         * console.log(lineCount)
         *
         * await nvim.call("nvim_buf_set_lines", [0, 0, -1, true, ["replace all content"]]);
         * ```
         */
        call<M extends keyof ApiInfo>(
            func: M,
            params: ApiInfo[M]["parameters"],
        ): Promise<ApiInfo[M]["returns"]> {
            const reqId = ++lastReqId;
            const request: RPCMessage = [MessageType.REQUEST, reqId, func as string, params];

            return new Promise((resolve, reject) => {
                emitter.once(`response-${reqId}`, (error, response) => {
                    if (error) reject(error);
                    resolve(response as ApiInfo[M]["returns"]);
                });

                messageOutQueue.push(request);
                processRequestQueue(nvimSocket);
            });
        },

        /**
         * Register a handler for rpc notifications
         *
         * Use `"*"` to register a catch-all notification handler.
         *
         * @example
         * ```ts
         * // you only receive notifications for events you are subcribed to
         * await nvim.call("nvim_subscribe", ["my_rpc_notification"]);
         *
         * // both "*" and "my_rpc_notification" "handlers
         * // would run on a "my_rpc_notification" notification from neovim
         *
         * nvim.onNotification("*", (args) => {
         *   // catch-all is always called first
         *   console.log(args);
         * });
         *
         * nvim.onNotification("my_rpc_notification", (args) => {
         *   console.log(args);
         * });
         * ```
         */
        onNotification<T extends "*" | keyof EventsMap>(
            event: T,
            callback: (args: T extends "*" ? unknown[] : EventsMap[T]) => void | Promise<void>,
        ) {
            notificationHandlers.set(event as string, callback);
        },

        /**
         * Close socket connection to neovim
         */
        detach() {
            nvimSocket.end();
        },
    };
}
