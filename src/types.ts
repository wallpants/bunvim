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

export type NotificationsMap = { "*": unknown[]; [x: string]: unknown[] };
export type RequestsMap = Record<string, unknown[]>;

export type RequestHandler<Args = Any> = (args: Args) => Awaitable<RequestResponse>;

export type NotificationHandler<Args = Any> = (args: Args, notification: string) => Awaitable<void>;
