import type winston from "winston";

export type Awaitable<T> = T | Promise<T>;

export type EventsMap = Record<string, unknown[]>;

export type BaseApiInfo<
    Notifications extends EventsMap = EventsMap,
    Requests extends EventsMap = EventsMap,
> = {
    functions: Record<string, { parameters: unknown[]; return_type: unknown }>;
    ui_events: Record<string, { parameters: unknown[] }>;
    ui_options: string[];
    error_types: Record<string, { id: number }>;
    types: Record<string, { id: number; prefix: string }>;
    notifications: Notifications;
    requests: Requests;
};

export type LogLevel = "error" | "warn" | "info" | "http" | "verbose" | "debug" | "silly";

export type Client = {
    /**
     * `name` can be used to find channel id on neovim.
     * It's also used for logging
     *
     * ```lua
     * -- look for channel.client.name in channel list
     * local chans_list = vim.fn.nvim_list_chans()
     * ```
     */
    name: string;
    version?: {
        /** major version (defaults to 0 if not set, for no release yet) */
        major?: number;
        /** minor version */
        minor?: number;
        /** patch number */
        patch?: number;
        /** string describing a prerelease, like "dev" or "beta1" */
        prerelease?: string;
        /** hash or similar identifier of commit */
        commit?: string;
    };
};

export type AttachParams = {
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
     * const nvim = await attach({ socket, client: { name: "my_client" } });
     * ```
     */
    socket: string;

    /**
     * RPC client info
     * This is sent to neovim on-connection-open by calling `nvim_set_client_info()`
     * @see {@link https://neovim.io/doc/user/api.html#nvim_set_client_info()}
     */
    client: Client;

    logging?: {
        /**
         * @remarks
         * bunvim internally logs with `logger.debug()` and `logger.error()`
         * Set logLevel higher than `debug` to not display bunvim's internal logs
         *
         * Levels from highest to lowest priority
         * - error
         * - warn
         * - info
         * - http
         * - verbose
         * - debug
         * - silly
         */
        level: LogLevel;
        file?: string | undefined;
    };
};

export enum MessageType {
    REQUEST = 0,
    RESPONSE = 1,
    NOTIFY = 2,
}

export type RPCRequest = [MessageType.REQUEST, id: number, method: string, args: unknown[]];
export type RPCNotification = [MessageType.NOTIFY, notification: string, args: unknown[]];
export type RPCResponse = [MessageType.RESPONSE, id: number, error: string | null, result: unknown];
export type RPCMessage = RPCRequest | RPCNotification | RPCResponse;

export type EventHandler<Args, Returns> = (args: Args) => Awaitable<Returns>;
export type NotificationHandler = EventHandler<unknown[], void>;
export type RequestHandler = EventHandler<unknown[], unknown>;

export type Nvim<ApiInfo extends BaseApiInfo = BaseApiInfo> = {
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
    call<M extends keyof ApiInfo["functions"]>(
        func: M,
        args: ApiInfo["functions"][M]["parameters"],
    ): Promise<ApiInfo["functions"][M]["return_type"]>;
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
    onNotification<N extends keyof ApiInfo["notifications"]>(
        notification: N,
        callback: EventHandler<ApiInfo["notifications"][N], void>,
    ): void;
    /**
     * Register/Update a handler for rpc requests
     *
     * @param method - method name
     * @param callback - request handler
     *
     * @example
     * ```typescript
     * nvim.onRequest("my_func", async (args) => {
     *   const result = await asyncFunc(args);
     *
     *   if (result < 10) {
     *     // throwing an error sends the error back to neovim
     *     throw Error("result too low");
     *   }
     *
     *   return result;
     * });
     * ```
     */
    onRequest<M extends keyof ApiInfo["requests"]>(
        method: M,
        callback: EventHandler<ApiInfo["requests"][M], unknown>,
    ): void;
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
