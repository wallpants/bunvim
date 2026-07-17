import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Packr, UnpackrStream } from "msgpackr";
import { MessageType, type RPCMessage, type RPCRequest, type RPCResponse } from "../types.ts";

const packr = new Packr({ useRecords: false });

export const FAKE_CHANNEL_ID = 42;

export type FakeNvim = {
   socketPath: string;
   /** every message the client has sent to this fake server */
   received: RPCMessage[];
   send(message: RPCMessage): void;
   /** write raw bytes to the client, used to test split RPC frames */
   sendRaw(bytes: Uint8Array): void;
   pack(message: RPCMessage): Uint8Array;
   /**
    * Override request handling (handshake requests are always auto-answered).
    * Return a response to send it, return undefined to leave the request unanswered.
    */
   onRequest(handler: (request: RPCRequest) => RPCResponse | undefined): void;
   close(): void;
};

export function startFakeNvim(): FakeNvim {
   const socketPath = join(tmpdir(), `bunvim-test-${crypto.randomUUID()}.sock`);
   const received: RPCMessage[] = [];
   const unpackrStream = new UnpackrStream({ useRecords: false });

   let clientSocket: Bun.Socket | undefined;
   let requestHandler: ((request: RPCRequest) => RPCResponse | undefined) | undefined;
   let closed = false;

   function send(message: RPCMessage) {
      clientSocket?.write(packr.pack(message));
   }

   unpackrStream.on("data", (message: RPCMessage) => {
      received.push(message);
      if (message[0] !== MessageType.REQUEST) return;

      // auto-answer the attach handshake
      if (message[2] === "nvim_set_client_info") {
         send([MessageType.RESPONSE, message[1], null, null]);
         return;
      }
      if (message[2] === "nvim_get_api_info") {
         send([MessageType.RESPONSE, message[1], null, [FAKE_CHANNEL_ID, {}]]);
         return;
      }

      if (requestHandler) {
         const response = requestHandler(message);
         if (response) send(response);
         return;
      }

      send([MessageType.RESPONSE, message[1], null, 123]);
   });

   const listener = Bun.listen({
      unix: socketPath,
      socket: {
         binaryType: "uint8array",
         open(socket) {
            clientSocket = socket;
         },
         data(_, data) {
            unpackrStream.write(data);
         },
      },
   });

   return {
      socketPath,
      received,
      send,
      sendRaw(bytes) {
         clientSocket?.write(bytes);
      },
      pack: (message) => packr.pack(message),
      onRequest(handler) {
         requestHandler = handler;
      },
      close() {
         if (closed) return;
         closed = true;
         clientSocket?.end();
         listener.stop(true);
         rmSync(socketPath, { force: true });
      },
   };
}

export async function waitFor<T>(get: () => T | undefined, timeoutMs = 1000): Promise<T> {
   const start = Date.now();
   while (Date.now() - start < timeoutMs) {
      const value = get();
      if (value !== undefined) return value;
      await Bun.sleep(5);
   }
   throw new Error("timeout waiting for condition");
}
