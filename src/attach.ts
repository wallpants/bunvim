import { Packr, UnpackrStream, addExtension, unpack } from "msgpackr";
import { createLogger, prettyRPCMessage } from "./logger.ts";
import {
   MessageType,
   type AttachParams,
   type Awaitable,
   type BaseEvents,
   type Nvim,
   type RPCMessage,
   type RPCNotification,
   type RPCRequest,
   type RPCResponse,
} from "./types.ts";

const packr = new Packr({ useRecords: false });

[0, 1, 2].forEach((type) => {
   // https://neovim.io/doc/user/api.html#api-definitions
   // decode Buffer, Window, and Tabpage as numbers
   // Buffer   id: 0    prefix: nvim_buf_
   // Window   id: 1    prefix: nvim_win_
   // Tabpage  id: 2    prefix: nvim_tabpage_
   addExtension({ type, unpack: (buffer) => unpack(buffer) as number });
});

function toError(error: unknown): Error {
   // neovim errors are usually [code, message] tuples
   if (Array.isArray(error) && typeof error[1] === "string") {
      return new Error(error[1]);
   }
   if (error instanceof Error) return error;
   if (typeof error === "string") return new Error(error);
   return new Error(JSON.stringify(error));
}

type UntypedHandler = (args: unknown[]) => Awaitable<unknown>;

export async function attach<ApiInfo extends BaseEvents = BaseEvents>({
   socket,
   client,
   logging,
}: AttachParams): Promise<Nvim<ApiInfo>> {
   const logger = createLogger(client, logging);
   const messageOutQueue: RPCMessage[] = [];
   const notificationHandlers = new Map<string, Map<number, UntypedHandler>>();
   const requestHandlers = new Map<string, UntypedHandler>();
   const pendingRequests = new Map<
      number,
      { resolve: (result: unknown) => void; reject: (error: Error) => void }
   >();
   // Sometimes RPC messages are split into multiple socket messages.
   // `unpackrStream` handles collecting all socket messages if the RPC message
   // is split and decoding it.
   const unpackrStream = new UnpackrStream({ useRecords: false });

   let lastReqId = 0;
   let handlerId = 0;
   let closed = false;

   function fail(error: Error) {
      if (closed) return;
      closed = true;
      messageOutQueue.length = 0;
      unpackrStream.removeAllListeners();
      for (const { reject } of pendingRequests.values()) {
         reject(error);
      }
      pendingRequests.clear();
   }

   const nvimSocket = await Bun.connect({
      unix: socket,
      socket: {
         binaryType: "uint8array",
         data(_, data) {
            unpackrStream.write(data);
         },
         error(_, error) {
            logger?.error("socket error", error);
            fail(error);
         },
         end() {
            logger?.debug("connection closed by neovim");
            fail(new Error("connection closed by neovim"));
         },
         close() {
            logger?.debug("connection closed by bunvim");
            fail(new Error("connection closed by bunvim"));
         },
      },
   });

   function processMessageOutQueue() {
      // All writing to neovim happens through this function.
      // Outgoing RPC messages are added to the `messageOutQueue` and sent ASAP
      let message: RPCMessage | undefined;
      while ((message = messageOutQueue.shift()) !== undefined) {
         logger?.debug(prettyRPCMessage(message, "out"));
         nvimSocket.write(packr.pack(message));
      }
   }

   async function runNotificationHandlers(message: RPCNotification) {
      // message[1] notification name
      // message[2] args
      const handlers = notificationHandlers.get(message[1]);
      if (!handlers) return;

      for (const [id, handler] of handlers) {
         try {
            const result = await handler(message[2]);
            // remove notification handler if it returns specifically `true`
            // other truthy values won't trigger the removal
            if (result === true) handlers.delete(id);
         } catch (error) {
            logger?.error(`notification handler error: ${message[1]}`, error);
         }
      }
   }

   unpackrStream.on("data", (message: RPCMessage) => {
      (async () => {
         logger?.debug(prettyRPCMessage(message, "in"));
         if (message[0] === MessageType.NOTIFY) {
            // RPCNotifications don't need a response
            await runNotificationHandlers(message);
         }

         if (message[0] === MessageType.RESPONSE) {
            // message[1] reqId
            // message[2] error
            // message[3] result
            const request = pendingRequests.get(message[1]);
            if (request) {
               pendingRequests.delete(message[1]);
               if (message[2] !== null) {
                  request.reject(toError(message[2]));
               } else {
                  request.resolve(message[3]);
               }
            }
         }

         if (message[0] === MessageType.REQUEST) {
            // message[1] reqId
            // message[2] method name
            // message[3] args
            const handler = requestHandlers.get(message[2]);

            // RPCRequests block neovim until a response is received.
            // RPCResponse is added to beginning of queue to be sent ASAP.
            if (!handler) {
               const notFound: RPCResponse = [
                  MessageType.RESPONSE,
                  message[1],
                  `no handler for method ${message[2]} found`,
                  null,
               ];
               messageOutQueue.unshift(notFound);
            } else {
               try {
                  const result = await handler(message[3]);
                  const response: RPCResponse = [MessageType.RESPONSE, message[1], null, result];
                  messageOutQueue.unshift(response);
               } catch (error) {
                  const response: RPCResponse = [
                     MessageType.RESPONSE,
                     message[1],
                     toError(error).message,
                     null,
                  ];
                  messageOutQueue.unshift(response);
               }
            }
         }

         // Continue processing queue
         processMessageOutQueue();
      })().catch((error: unknown) => logger?.error("unpackrStream error", error));
   });

   const call: Nvim["call"] = (func, args) => {
      if (closed) {
         return Promise.reject(new Error("connection closed"));
      }

      const reqId = ++lastReqId;
      const request: RPCRequest = [MessageType.REQUEST, reqId, func, args];

      return new Promise((resolve, reject) => {
         // Register before adding request to queue to avoid
         // response coming in before we're ready to handle it.
         pendingRequests.set(reqId, { resolve, reject });
         messageOutQueue.push(request);
         processMessageOutQueue();
      });
   };

   await call("nvim_set_client_info", [
      client.name,
      client.version ?? {},
      client.type ?? "msgpack-rpc",
      client.methods ?? {},
      client.attributes ?? {},
   ]);

   const channelId = (await call("nvim_get_api_info", []))[0] as number;

   return {
      call,
      channelId,
      logger: logger,
      onNotification(notification, callback) {
         const name = notification as string;
         const handlers = notificationHandlers.get(name) ?? new Map<number, UntypedHandler>();
         handlers.set(++handlerId, callback as UntypedHandler);
         notificationHandlers.set(name, handlers);
      },
      onRequest(method, callback) {
         requestHandlers.set(method as string, callback as UntypedHandler);
      },
      detach() {
         fail(new Error("connection closed by bunvim"));
         nvimSocket.end();
      },
   };
}
