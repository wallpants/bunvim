import { EventEmitter } from "node:events";
import { createLogger, prettyRPCMessage } from "./logger.ts";
import {
    MessageType,
    type NotificationHandler,
    type NotificationsMap,
    type Nvim,
    type RPCMessage,
    type RPCRequest,
    type RPCResponse,
    type RequestHandler,
    type RequestsMap,
} from "./types.ts";
// eslint-disable-next-line import/named
import { Packr, UnpackrStream, addExtension, unpack } from "msgpackr";

const packr = new Packr({ useRecords: false });
const unpackrStream = new UnpackrStream({ useRecords: false });

// decode Buffer, Window, and Tabpage as numbers
// Buffer: { id: 0, prefix: 'nvim_buf_' },
addExtension({ type: 0, unpack: (value) => unpack(value) as number });
// Window: { id: 1, prefix: 'nvim_win_' },
addExtension({ type: 1, unpack: (value) => unpack(value) as number });
// Tabpage: { id: 2, prefix: 'nvim_tabpage_' }
addExtension({ type: 2, unpack: (value) => unpack(value) as number });

export async function attach<
    NMap extends NotificationsMap = NotificationsMap,
    RMap extends RequestsMap = RequestsMap,
>({
    socket,
    logFile,
    logLevel = "verbose",
}: {
    socket: string;
    logFile?: string;
    logLevel?: string;
}): Promise<Nvim<NMap, RMap>> {
    const logger = createLogger(logFile, logLevel);
    const messageOutQueue: RPCMessage[] = [];
    const notificationHandlers = new Map<string, NotificationHandler>();
    const requestHandlers = new Map<string, RequestHandler>();
    const emitter = new EventEmitter({ captureRejections: true });
    // let messageOutHandler: AnyFunction | undefined;
    // let messageInHandler: AnyFunction | undefined;

    let lastReqId = 0;
    let awaitingResponse = false;

    const nvimSocket = await Bun.connect({
        unix: socket,
        socket: {
            binaryType: "uint8array",
            data(_, data) {
                unpackrStream.write(data);
            },
        },
    });

    function processMessageQueue() {
        if (!messageOutQueue.length || awaitingResponse) return;
        awaitingResponse = true;

        const message = messageOutQueue.shift();
        if (!message) {
            logger?.error("request is undefined");
            return;
        }

        logger?.verbose(prettyRPCMessage(message));
        nvimSocket.write(packr.pack(message));
    }

    unpackrStream.on("data", (message: RPCMessage) => {
        (async () => {
            logger?.verbose(prettyRPCMessage(message));
            if (message[0] === MessageType.NOTIFY) {
                // message[1] notification name
                // message[2] args
                const catchAllHander = notificationHandlers.get("*");
                void catchAllHander?.(message[2], message[1]);

                const notificationHandler = notificationHandlers.get(message[1]);
                void notificationHandler?.(message[2], message[1]);
            }

            if (message[0] === MessageType.RESPONSE) {
                // message[1] reqId
                // message[2] error
                // message[3] result
                emitter.emit(`response-${message[1]}`, message[2], message[3]);
                awaitingResponse = false;
            }

            if (message[0] === MessageType.REQUEST) {
                // message[1] reqId
                // message[2] method name
                // message[3] args
                const handler = requestHandlers.get(message[2]);

                if (!handler) {
                    const notFound: RPCResponse = [
                        MessageType.RESPONSE,
                        message[1],
                        `no handler for method ${message[2]} found`,
                        null,
                    ];
                    messageOutQueue.unshift(notFound);
                } else {
                    const { error, success } = await handler(message[3]);
                    const response: RPCResponse = [
                        MessageType.RESPONSE,
                        message[1],
                        error,
                        success,
                    ];
                    messageOutQueue.unshift(response);
                }
            }

            if (messageOutQueue.length) {
                processMessageQueue();
            }
        })().catch((err) => logger?.error(err));
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
         * console.log(currLine);
         *
         * await nvim.call("nvim_buf_set_lines", [0, 0, -1, true, ["replace all content"]]);
         * ```
         */
        call(func, args) {
            const reqId = ++lastReqId;
            const request: RPCRequest = [MessageType.REQUEST, reqId, func as string, args];

            return new Promise((resolve, reject) => {
                emitter.once(`response-${reqId}`, (error, result) => {
                    if (error) reject(error);
                    resolve(result as unknown);
                });

                messageOutQueue.push(request);
                processMessageQueue();
            });
        },

        /**
         * Register a handler for outoging rpc messages
         *
         * @remarks
         * This handler will run for all received messages, useful for debugging
         *
         * @param callback - message handler
         *
         * @example
         * ```ts
         * nvim.onMessage((message: RPCMessage) => {
         *   console.log(message);
         * });
         * ```
         */
        // onMessageOut(callback) {
        //     messageOutHandler = callback;
        // },

        /**
         * Register a handler for incoming rpc messages
         *
         * @remarks
         * This handler will run for all received messages, useful for debugging
         *
         * @param callback - message handler
         *
         * @example
         * ```ts
         * nvim.onMessage((message: RPCMessage) => {
         *   console.log(message);
         * });
         * ```
         */
        // onMessageIn(callback) {
        //     messageInHandler = callback;
        // },

        /**
         * Register/Update a handler for rpc notifications
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
        onNotification(notification, callback) {
            notificationHandlers.set(notification as string, callback);
        },

        /**
         * Register/Update a handler for rpc requests
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
        onRequest(method, callback) {
            requestHandlers.set(method as string, callback);
        },

        /**
         * Close socket connection to neovim
         */
        detach() {
            nvimSocket.end();
        },

        /**
         * reference to winston logger
         */
        logger: logger,
    };
}
