export enum MessageType {
    REQUEST = 0,
    RESPONSE = 1,
    NOTIFY = 2,
}

export type RPCRequest = [MessageType.REQUEST, id: number, method: string, args: unknown[]];
export type RPCNotification = [MessageType.NOTIFY, notification: string, args: unknown[]];
// TODO(gualcasas): should result be an array?
export type RPCResponse = [MessageType.RESPONSE, id: number, error: string | null, result: unknown];

export type RPCMessage = RPCRequest | RPCNotification | RPCResponse;

type RequestHandlerResult = { error: RPCResponse[2]; success: RPCResponse[3] };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RequestHandler<Args = any> = (
    args: Args,
    method: string,
) => RequestHandlerResult | Promise<RequestHandlerResult>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NotificationHandler<Args = any> = (
    args: Args,
    notification: string,
) => void | Promise<void>;

export type NotificationsMap = { "*": unknown[]; [x: string]: unknown[] };
export type RequestsMap = Record<string, unknown[]>;
