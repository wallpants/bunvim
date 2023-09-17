import { EventEmitter } from "node:events";
import { createLogger, prettyRPCMessage } from "./logger.ts";
import {
    MessageType,
    type NotificationHandler,
    type Nvim,
    type RPCMessage,
    type RPCRequest,
    type RPCResponse,
    type RequestHandler,
} from "./types.ts";
// eslint-disable-next-line import/named
import { Packr, UnpackrStream, addExtension, unpack } from "msgpackr";

const packr = new Packr({ useRecords: false });
const unpackrStream = new UnpackrStream({ useRecords: false });

[0, 1, 2].forEach((type) => {
    // decode Buffer, Window, and Tabpage as numbers
    // Buffer: { id: 0, prefix: 'nvim_buf_' },
    // Window: { id: 1, prefix: 'nvim_win_' },
    // Tabpage: { id: 2, prefix: 'nvim_tabpage_' }
    addExtension({
        type,
        unpack(buffer) {
            return unpack(buffer) as number;
        },
    });
});

export async function attach<
    NMap extends Record<string, unknown[]> = Record<string, unknown[]>,
    RMap extends Record<string, unknown[]> = Record<string, unknown[]>,
>({
    socket,
    logFile,
    logLevel,
}: {
    /**
     * neovim socket
     *
     * Usually you get this value from `process.env.NVIM` which is set
     * automagically by neovim on any child processes
     *
     * @see {@link https://neovim.io/doc/user/eval.html#%24NVIM}
     * @see {@link https://neovim.io/doc/user/eval.html#v%3Aservername}
     *
     * @example
     * ```lua
     * -- init.lua
     * vim.fn.jobstart("bun run src/main.ts", { cwd = root_dir })
     * ```
     *
     * ```typescript
     * // src/main.ts
     * const socket = process.env.NVIM;
     * if (!socket) throw Error("socket missing");
     *
     * const nvim = await attach({ socket });
     * ```
     */
    socket: string;
    /**
     * Path to logFile.
     * `logger` is disabled if no `logFile` is provided
     *
     * @example "/tmp/bunvim-logs"
     */
    logFile?: string | undefined;
    /**
     * @remarks
     * bunvim internally logs with `logger.debug()` and `logger.error()`
     * Set logLevel higher than `debug` to hide bunvim's internal logs
     *
     * Levels from highest to lowest priority
     * - error
     * - warn
     * - info
     * - http
     * - verbose
     * - debug
     * - silly
     *
     * @default "debug"
     */
    logLevel?: string | undefined;
}): Promise<Nvim<NMap, RMap>> {
    const logger = createLogger(logFile, logLevel);
    const messageOutQueue: RPCMessage[] = [];
    const notificationHandlers = new Map<string, NotificationHandler>();
    const requestHandlers = new Map<string, RequestHandler>();
    const emitter = new EventEmitter({ captureRejections: true });

    let lastReqId = 0;
    let awaitingResponse = false;

    const nvimSocket = await Bun.connect({
        unix: socket,
        socket: {
            binaryType: "uint8array",
            data(_, data) {
                unpackrStream.write(data);
            },
            error(_socket, error) {
                logger?.error("socket error", error);
            },
            end() {
                logger?.debug("connection closed by neovim");
            },
            close() {
                logger?.debug("connection closed by bunvim");
            },
        },
    });

    function processMessageQueue() {
        if (!messageOutQueue.length || awaitingResponse) return;
        awaitingResponse = true;

        const message = messageOutQueue.shift();
        if (!message) {
            logger?.error("Cannot process undefined message");
            return;
        }

        logger?.debug(prettyRPCMessage(message, "out"));
        nvimSocket.write(packr.pack(message));
    }

    unpackrStream.on("data", (message: RPCMessage) => {
        (async () => {
            logger?.debug(prettyRPCMessage(message, "in"));
            if (message[0] === MessageType.NOTIFY) {
                // message[1] notification name
                // message[2] args
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

            processMessageQueue();
        })().catch((err) => logger?.error("unpackrStream error", err));
    });

    return {
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
        onNotification(notification, callback) {
            notificationHandlers.set(notification as string, callback);
        },
        onRequest(method, callback) {
            requestHandlers.set(method as string, callback);
        },
        detach() {
            nvimSocket.end();
        },
        logger: logger,
    };
}
