import { type Socket } from "bun";
import { pack, unpack } from "msgpackr";
import { EventEmitter } from "node:events";
import { type ApiInfo } from "./generated-api-info.ts";
import { logger } from "./logger.ts";

enum MessageType {
    REQUEST = 0,
    RESPONSE = 1,
    NOTIFY = 2,
}

type RPCMessage =
    | [MessageType.REQUEST, id: number, method: string, args: unknown[]]
    | [MessageType.RESPONSE, id: number, error: Error | null, response: unknown]
    | [MessageType.NOTIFY, eventName: string, args: unknown[]];

type NotificationHandler = (args: unknown[], event: string) => void | Promise<void>;
type RequestHandler = (params: unknown[], method: string) => RPCMessage | Promise<RPCMessage>;

export async function attach<
    EventsMap extends Record<string, unknown[]> = Record<string, unknown[]>,
>({ socket }: { socket: string }) {
    const requestHandlers = new Map<string, RequestHandler>();
    const notificationHandlers = new Map<string, NotificationHandler>();
    const emitter = new EventEmitter({ captureRejections: true });
    const messageOutQueue: RPCMessage[] = [];

    let lastReqId = 0;
    let awaitingResponse = false;

    function processRequestQueue(socket: Socket) {
        if (!messageOutQueue.length || awaitingResponse) return;
        awaitingResponse = true;

        const request = messageOutQueue.shift();
        if (!request) return;

        logger.verbose("OUTGOING", {
            REQUEST: {
                reqId: request[1],
                method: request[2],
                params: request[3],
            },
        });
        socket.write(pack(request));
    }

    const nvimSocket = await Bun.connect({
        unix: socket,
        socket: {
            async data(socket, data) {
                const message = unpack(data) as RPCMessage;
                if (message[0] === MessageType.NOTIFY) {
                    logger.verbose("INCOMING", { NOTIFICATION: message });
                    const catchAllHander = notificationHandlers.get("*");
                    void catchAllHander?.(message[2], message[1]);

                    const notificationHandler = notificationHandlers.get(message[1]);
                    void notificationHandler?.(message[2], message[1]);
                }

                if (message[0] === MessageType.RESPONSE) {
                    logger.verbose("INCOMING", {
                        RESPONSE: {
                            reqId: message[1],
                            error: message[2],
                            response: message[3],
                        },
                    });
                    emitter.emit(`response-${message[1]}`, message[2], message[3]);
                    awaitingResponse = false;
                }

                if (message[0] === MessageType.REQUEST) {
                    logger.verbose("INCOMING", {
                        REQUEST: {
                            reqId: message[1],
                            method: message[2],
                            args: message[3],
                        },
                    });

                    const handler = requestHandlers.get(message[2]);

                    if (!handler) {
                        const notFound: RPCMessage = [
                            MessageType.RESPONSE,
                            message[1],
                            Error(`no handler for method ${message[2]} found`),
                            null,
                        ];
                        messageOutQueue.unshift(notFound);
                    } else {
                        // TODO(gualcasas): Add timeout guard
                        const response = await handler(message[3], message[2]);
                        messageOutQueue.unshift(response);
                    }
                }

                if (messageOutQueue.length) {
                    processRequestQueue(socket);
                }
            },
            end() {
                logger.verbose("neovim closed connection");
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
         * @param func - event name
         * @param callback - notification handler
         *
         * Use `"*"` to register a catch-all notification handler.
         *
         * @example
         * ```ts
         * await nvim.call("nvim_subscribe", ["my_rpc_notification"]);
         *
         * // both "*" and "my_rpc_notification" "handlers
         * // would run on a "my_rpc_notification" notification from neovim
         *
         * nvim.onNotification("*", (args, event) => {
         *   console.log(event);
         *   console.log(args);
         * });
         *
         * nvim.onNotification("my_rpc_notification", (args) => {
         *   console.log(args);
         * });
         * ```
         */
        onNotification<T extends "*" | keyof EventsMap>(event: T, callback: NotificationHandler) {
            notificationHandlers.set(event as string, callback);
        },

        onRequest(method: string, callback: RequestHandler) {
            requestHandlers.set(method, callback);
        },

        /**
         * Close socket connection to neovim
         */
        detach() {
            nvimSocket.end();
        },
    };
}
