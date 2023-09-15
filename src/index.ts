import { type Socket } from "bun";
import { pack, unpack } from "msgpackr";
import { EventEmitter } from "node:events";
import { type ApiInfo } from "./generated-api-info.ts";
import { createLogger } from "./logger.ts";
import {
    MessageType,
    type NotificationHandler,
    type NotificationsMap,
    type RPCMessage,
    type RPCResponse,
    type RequestHandler,
    type RequestsMap,
} from "./types.ts";
export * from "./types.ts";

const logger = createLogger(process.env.BUNVIM_LOG_FILE, process.env.BUNVIM_LOG_LEVEL);

export async function attach<
    NMap extends NotificationsMap = NotificationsMap,
    RMap extends RequestsMap = RequestsMap,
>({ socket }: { socket: string }) {
    const messageOutQueue: RPCMessage[] = [];
    const notificationHandlers = new Map<string, NotificationHandler>();
    const requestHandlers = new Map<string, RequestHandler>();
    const emitter = new EventEmitter({ captureRejections: true });

    let lastReqId = 0;
    let awaitingResponse = false;

    function processRequestQueue(socket: Socket) {
        if (!messageOutQueue.length || awaitingResponse) return;
        awaitingResponse = true;

        const request = messageOutQueue.shift();
        if (!request) return;

        if (request[0] === MessageType.REQUEST) {
            logger.verbose("OUTGOING", {
                REQUEST: {
                    reqId: request[1],
                    method: request[2],
                    params: request[3],
                },
            });
        }

        if (request[0] === MessageType.RESPONSE) {
            logger.verbose("OUTGOING", {
                RESPONSE: {
                    reqId: request[1],
                    error: request[2],
                    result: request[3],
                },
            });
        }

        socket.write(pack(request));
    }

    const nvimSocket = await Bun.connect({
        unix: socket,
        socket: {
            async data(socket, data) {
                const message = unpack(data) as RPCMessage;
                if (message[0] === MessageType.NOTIFY) {
                    const [, notification, args] = message;
                    logger.verbose("INCOMING", { NOTIFICATION: message });

                    const catchAllHander = notificationHandlers.get("*");
                    void catchAllHander?.(args, notification);

                    const notificationHandler = notificationHandlers.get(notification);
                    void notificationHandler?.(args, notification);
                }

                if (message[0] === MessageType.RESPONSE) {
                    const [, reqId, error, result] = message;
                    logger.verbose("INCOMING", { RESPONSE: { reqId, error, result } });
                    emitter.emit(`response-${reqId}`, error, result);
                    awaitingResponse = false;
                }

                if (message[0] === MessageType.REQUEST) {
                    const [, reqId, method, args] = message;
                    logger.verbose("INCOMING", { REQUEST: { reqId, method, args } });

                    const handler = requestHandlers.get(method);

                    if (!handler) {
                        const notFound: RPCResponse = [
                            MessageType.RESPONSE,
                            reqId,
                            `no handler for method ${method} found`,
                            null,
                        ];
                        messageOutQueue.unshift(notFound);
                    } else {
                        const result = await handler(args);
                        const response: RPCResponse = [
                            MessageType.RESPONSE,
                            reqId,
                            result.error,
                            result.success,
                        ];
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
         * @param args - function arguments, provide empty array [] if no args
         *
         * @example
         * ```ts
         * const currLine = await nvim.call("nvim_get_current_line", []);
         * console.log(currLine)
         *
         * await nvim.call("nvim_buf_set_lines", [0, 0, -1, true, ["replace all content"]]);
         * ```
         */
        call<M extends keyof ApiInfo>(
            func: M,
            args: ApiInfo[M]["parameters"],
        ): Promise<ApiInfo[M]["returns"]> {
            const reqId = ++lastReqId;
            const request: RPCMessage = [MessageType.REQUEST, reqId, func as string, args];

            return new Promise((resolve, reject) => {
                emitter.once(`response-${reqId}`, (error, result) => {
                    if (error) reject(error);
                    resolve(result as ApiInfo[M]["returns"]);
                });

                messageOutQueue.push(request);
                processRequestQueue(nvimSocket);
            });
        },

        /**
         * Register a handler for rpc notifications
         *
         * @param notification - event name
         * @param callback - notification handler
         *
         * @remarks
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
        onNotification<N extends keyof NMap>(
            notification: N,
            callback: NotificationHandler<NMap[N]>,
        ) {
            notificationHandlers.set(notification as string, callback);
        },

        /**
         * Register a handler for rpc requests
         *
         * @param method - method name
         * @param callback - request handler
         *
         * @example
         * ```ts
         * import { RequestResponse } from 'bunvim';
         *
         * nvim.onRequest("my_func", async (args) => {
         *   const { error, success }: RequestResponse = await asyncFunc(args);
         *   return { error, success };
         * });
         * ```
         */
        onRequest<M extends keyof RMap>(method: M, callback: RequestHandler<RMap[M]>) {
            requestHandlers.set(method as string, callback);
        },

        /**
         * Close socket connection to neovim
         */
        detach() {
            nvimSocket.end();
        },
    };
}
