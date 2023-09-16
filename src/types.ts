import type winston from "winston";
import { type ApiInfo } from "./generated-api-info.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Any = any;
export type Awaitable<T> = T | Promise<T>;

export enum MessageType {
    REQUEST = 0,
    RESPONSE = 1,
    NOTIFY = 2,
}

export type RequestResponse = { error: string | null; success: unknown };

export type RPCRequest = [MessageType.REQUEST, id: number, method: string, args: unknown[]];
export type RPCNotification = [MessageType.NOTIFY, notification: string, args: unknown[]];
export type RPCResponse = [
    MessageType.RESPONSE,
    id: number,
    error: RequestResponse["error"],
    result: RequestResponse["success"],
];

export type RPCMessage = RPCRequest | RPCNotification | RPCResponse;

export type RequestHandler<Args = Any> = (args: Args) => Awaitable<RequestResponse>;
export type NotificationHandler<Args = Any> = (args: Args, notification: string) => Awaitable<void>;

export type Nvim<
    NMap extends Record<string, unknown[]> = Record<string, unknown[]>,
    RMap extends Record<string, unknown[]> = Record<string, unknown[]>,
> = {
    /**
     * Call a neovim function
     * @see {@link https://neovim.io/doc/user/api.html}
     *
     * @param func - function name
     * @param args - function arguments, provide empty array `[]` if no args
     *
     * @example
     * ```typescript
     * const currLine = await nvim.call("nvim_get_current_line", []);
     * nvim.logger?.info(currLine);
     *
     * await nvim.call("nvim_buf_set_lines", [0, 0, -1, true, ["replace all content"]]);
     * ```
     */
    call<M extends keyof ApiInfo>(
        func: M,
        args: ApiInfo[M]["parameters"],
    ): Promise<ApiInfo[M]["returns"]>;
    /**
     * Register/Update a handler for rpc notifications
     *
     * @param notification - event name
     * @param callback - notification handler
     *
     * @example
     * ```typescript
     * await nvim.call("nvim_subscribe", ["my_rpc_notification"]);
     *
     * nvim.onNotification("my_rpc_notification", (args) => {
     *   nvim.logger?.info(args);
     * });
     * ```
     */
    onNotification<N extends keyof NMap>(
        notification: N,
        callback: NotificationHandler<NMap[N]>,
    ): void;
    /**
     * Register/Update a handler for rpc requests
     *
     * @param method - method name
     * @param callback - request handler
     *
     * @example
     * ```typescript
     * import { RequestResponse } from 'bunvim';
     *
     * nvim.onRequest("my_func", async (args) => {
     *   const { error, success }: RequestResponse = await asyncFunc(args);
     *   return { error, success };
     * });
     * ```
     */
    onRequest<M extends keyof RMap>(method: M, callback: RequestHandler<RMap[M]>): void;
    /**
     * Close socket connection to neovim
     */
    detach(): void;
    /**
     * Reference to winston logger. `undefined` if no `logFile` provided
     * to `attach`
     */
    logger: winston.Logger | undefined;
};
