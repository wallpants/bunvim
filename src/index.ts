import { type Socket } from "bun";
import { pack, unpack } from "msgpackr";
import { EventEmitter } from "node:events";
import { type NeovimApiInfo } from "./generated-api-info.ts";

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
    ApiInfo extends Record<string, { parameters: unknown[]; returns: unknown }> = NeovimApiInfo,
>({ socket }: { socket: string }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const notificationHandlers = new Map<string, (args: any) => void | Promise<void>>();
    const emitter = new EventEmitter({ captureRejections: true });
    const messageOutQueue: RPCMessage[] = [];

    let awaitingResponse = false;
    let lastReqId = 0;

    function processRequestQueue(socket: Socket) {
        if (!messageOutQueue.length || awaitingResponse) return;
        awaitingResponse = true;
        socket.write(pack(messageOutQueue.shift()));
    }

    const nvimSocket = await Bun.connect({
        unix: socket,
        socket: {
            async data(socket, data) {
                const message = unpack(data) as RPCMessage;
                if (message[0] === MessageType.NOTIFY) {
                    const catchAllHander = notificationHandlers.get("*");
                    await catchAllHander?.(message[2]);

                    const notificationHandler = notificationHandlers.get(message[1]);
                    await notificationHandler?.(message[2]);
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

    function call<M extends keyof ApiInfo>(
        method: M,
        args: ApiInfo[M]["parameters"],
    ): Promise<ApiInfo[M]["returns"]> {
        const reqId = ++lastReqId;
        const request: RPCMessage = [MessageType.REQUEST, reqId, method as string, args];
        return new Promise((resolve, reject) => {
            emitter.once(`response-${reqId}`, (error, response) => {
                if (error) reject(error);
                resolve(response as ApiInfo[M]["returns"]);
            });
            messageOutQueue.push(request);
            processRequestQueue(nvimSocket);
        });
    }

    /** "*" is the catch-all notification handler */
    function onNotification<T extends "*" | keyof EventsMap>(
        event: T,
        callback: (args: T extends "*" ? unknown[] : EventsMap[T]) => void | Promise<void>,
    ) {
        notificationHandlers.set(event as string, callback);
    }

    // TODO(gualcasas): implement onRequest similar to onNotification
    return { call, onNotification };
}
