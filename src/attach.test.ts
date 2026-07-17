import { afterEach, expect, test } from "bun:test";
import { attach } from "./attach.ts";
import { FAKE_CHANNEL_ID, startFakeNvim, waitFor, type FakeNvim } from "./test-utils/fake-nvim.ts";
import { MessageType, type Nvim, type RPCRequest } from "./types.ts";

let fakes: FakeNvim[] = [];
let nvims: Nvim[] = [];

function startFake() {
   const fake = startFakeNvim();
   fakes.push(fake);
   return fake;
}

async function connect(fake: FakeNvim) {
   const nvim = await attach({ socket: fake.socketPath, client: { name: "bunvim-test" } });
   nvims.push(nvim);
   return nvim;
}

afterEach(() => {
   nvims.forEach((nvim) => nvim.detach());
   fakes.forEach((fake) => fake.close());
   nvims = [];
   fakes = [];
});

async function expectReject(promise: Promise<unknown>, message: string) {
   let error: Error | undefined;
   try {
      await promise;
   } catch (caught) {
      error = caught as Error;
   }
   expect(error).toBeInstanceOf(Error);
   expect(error?.message).toContain(message);
}

test("attach performs handshake and exposes channelId", async () => {
   const fake = startFake();
   const nvim = await connect(fake);

   expect(nvim.channelId).toBe(FAKE_CHANNEL_ID);

   const clientInfo = fake.received.find(
      (message) => message[0] === MessageType.REQUEST && message[2] === "nvim_set_client_info",
   );
   expect(clientInfo).toBeDefined();
});

test("call resolves with the response result", async () => {
   const fake = startFake();
   const nvim = await connect(fake);

   const result = await nvim.call("nvim_get_current_buf", []);
   expect(result).toBe(123);
});

test("correlates out-of-order responses by request id", async () => {
   const fake = startFake();
   const nvim = await connect(fake);

   const pending: RPCRequest[] = [];
   fake.onRequest((request) => {
      pending.push(request);
      return undefined;
   });

   const first = nvim.call("nvim_get_current_line", []);
   const second = nvim.call("nvim_get_current_line", []);

   await waitFor(() => (pending.length >= 2 ? true : undefined));
   const requestA = pending[0];
   const requestB = pending[1];
   if (!requestA || !requestB) throw new Error("unreachable");

   // respond in reverse order
   fake.send([MessageType.RESPONSE, requestB[1], null, "second"]);
   fake.send([MessageType.RESPONSE, requestA[1], null, "first"]);

   expect(await first).toBe("first");
   expect(await second).toBe("second");
});

test("rejects with a real Error on [code, message] error responses", async () => {
   const fake = startFake();
   const nvim = await connect(fake);

   fake.onRequest((request) => [MessageType.RESPONSE, request[1], [1, "boom"], null]);

   await expectReject(nvim.call("nvim_get_current_line", []), "boom");
});

test("rejects with a real Error on string error responses", async () => {
   const fake = startFake();
   const nvim = await connect(fake);

   fake.onRequest((request) => [MessageType.RESPONSE, request[1], "string error", null]);

   await expectReject(nvim.call("nvim_get_current_line", []), "string error");
});

test("reassembles RPC messages split across socket writes", async () => {
   const fake = startFake();
   const nvim = await connect(fake);

   const receivedArgs: unknown[] = [];
   nvim.onNotification("split_event", (args) => {
      receivedArgs.push(args);
   });

   const bytes = fake.pack([MessageType.NOTIFY, "split_event", ["hello", 42]]);
   const mid = Math.floor(bytes.length / 2);
   fake.sendRaw(bytes.subarray(0, mid));
   await Bun.sleep(10);
   fake.sendRaw(bytes.subarray(mid));

   await waitFor(() => (receivedArgs.length === 1 ? true : undefined));
   expect(receivedArgs[0]).toEqual(["hello", 42]);
});

test("notification handlers are isolated and removable", async () => {
   const fake = startFake();
   const nvim = await connect(fake);

   const calls: string[] = [];
   nvim.onNotification("evt", () => {
      calls.push("thrower");
      throw new Error("handler boom");
   });
   nvim.onNotification("evt", () => {
      calls.push("once");
      // returning `true` removes the handler
      return true;
   });
   nvim.onNotification("evt", () => {
      calls.push("always");
   });

   fake.send([MessageType.NOTIFY, "evt", []]);
   await waitFor(() => (calls.length === 3 ? true : undefined));

   fake.send([MessageType.NOTIFY, "evt", []]);
   await waitFor(() => (calls.length === 5 ? true : undefined));

   expect(calls).toEqual(["thrower", "once", "always", "thrower", "always"]);
});

test("responds to requests from neovim", async () => {
   const fake = startFake();
   const nvim = await connect(fake);

   nvim.onRequest("double", (args) => (args[0] as number) * 2);
   fake.send([MessageType.REQUEST, 7, "double", [21]]);

   const response = await waitFor(() =>
      fake.received.find((message) => message[0] === MessageType.RESPONSE && message[1] === 7),
   );
   expect(response).toEqual([MessageType.RESPONSE, 7, null, 42]);
});

test("responds with an error when a request handler throws", async () => {
   const fake = startFake();
   const nvim = await connect(fake);

   nvim.onRequest("bad", () => {
      throw new Error("req boom");
   });
   fake.send([MessageType.REQUEST, 8, "bad", []]);

   const response = await waitFor(() =>
      fake.received.find((message) => message[0] === MessageType.RESPONSE && message[1] === 8),
   );
   expect(response).toEqual([MessageType.RESPONSE, 8, "req boom", null]);
});

test("responds with an error for unknown request methods", async () => {
   const fake = startFake();
   await connect(fake);

   fake.send([MessageType.REQUEST, 9, "nope", []]);

   const response = await waitFor(() =>
      fake.received.find((message) => message[0] === MessageType.RESPONSE && message[1] === 9),
   );
   expect(response).toEqual([MessageType.RESPONSE, 9, "no handler for method nope found", null]);
});

test("two connections don't share stream state", async () => {
   const fakeA = startFake();
   const fakeB = startFake();
   const nvimA = await connect(fakeA);
   const nvimB = await connect(fakeB);

   const gotA: unknown[] = [];
   const gotB: unknown[] = [];
   nvimA.onNotification("evt", (args) => {
      gotA.push(args);
   });
   nvimB.onNotification("evt", (args) => {
      gotB.push(args);
   });

   fakeA.send([MessageType.NOTIFY, "evt", ["one"]]);
   await waitFor(() => (gotA.length === 1 ? true : undefined));
   await Bun.sleep(20);
   expect(gotB).toEqual([]);

   fakeB.send([MessageType.NOTIFY, "evt", ["two"]]);
   await waitFor(() => (gotB.length === 1 ? true : undefined));
   expect(gotA.length).toBe(1);
});

test("pending calls reject when the connection closes", async () => {
   const fake = startFake();
   const nvim = await connect(fake);

   fake.onRequest(() => undefined);
   const pending = nvim.call("nvim_get_current_line", []);
   await waitFor(() =>
      fake.received.find(
         (message) => message[0] === MessageType.REQUEST && message[2] === "nvim_get_current_line",
      ),
   );

   fake.close();

   await expectReject(pending, "connection closed");
   await expectReject(nvim.call("nvim_get_current_line", []), "connection closed");
});

test("detach rejects pending calls and is idempotent", async () => {
   const fake = startFake();
   const nvim = await connect(fake);

   fake.onRequest(() => undefined);
   const pending = nvim.call("nvim_get_current_line", []);
   await waitFor(() =>
      fake.received.find(
         (message) => message[0] === MessageType.REQUEST && message[2] === "nvim_get_current_line",
      ),
   );

   nvim.detach();

   await expectReject(pending, "connection closed by bunvim");
   await expectReject(nvim.call("nvim_get_current_line", []), "connection closed");

   // second detach is a no-op
   nvim.detach();
});
