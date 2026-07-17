import { expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger, prettyRPCMessage } from "./logger.ts";
import { MessageType } from "./types.ts";

async function waitForFileContaining(path: string, marker: string, timeoutMs = 2000) {
   const start = Date.now();
   while (Date.now() - start < timeoutMs) {
      if (existsSync(path)) {
         const content = await Bun.file(path).text();
         if (content.includes(marker)) return content;
      }
      await Bun.sleep(10);
   }
   throw new Error(`timeout waiting for "${marker}" in ${path}`);
}

test("createLogger returns undefined when logging is disabled", () => {
   expect(createLogger({ name: "bunvim-test" })).toBeUndefined();
   expect(createLogger({ name: "bunvim-test" }, {})).toBeUndefined();
});

test("writes each entry exactly once to the default log file", async () => {
   const name = `bunvim-test-${crypto.randomUUID()}`;
   const path = `/tmp/${name}.bunvim.logs`;
   const logger = createLogger({ name }, { level: "debug" });
   if (!logger) throw new Error("expected logger");

   try {
      logger.info("hello-marker");
      logger.end();

      const content = await waitForFileContaining(path, "hello-marker");
      const occurrences = content.split("hello-marker").length - 1;
      expect(occurrences).toBe(1);
      // header (level + timestamp) and pretty-printed body are both present
      expect(content).toMatch(/info/);
      expect(content).toMatch(/\d{2}:\d{2}:\d{2}\.\d{3}/);
   } finally {
      rmSync(path, { force: true });
   }
});

test("writes JSON entries to the configured log file", async () => {
   const name = `bunvim-test-${crypto.randomUUID()}`;
   const defaultPath = `/tmp/${name}.bunvim.logs`;
   const file = join(tmpdir(), `${name}.json.log`);
   const logger = createLogger({ name }, { level: "debug", file });
   if (!logger) throw new Error("expected logger");

   try {
      logger.info("json-marker");
      logger.end();

      const content = await waitForFileContaining(file, "json-marker");
      const lines = content.split("\n").filter((line) => line.includes("json-marker"));
      expect(lines.length).toBe(1);
      const first = lines[0];
      if (!first) throw new Error("unreachable");
      const entry = JSON.parse(first) as { message: string; timestamp: string };
      expect(entry.message).toBe("json-marker");
      expect(entry.timestamp).toBeDefined();
   } finally {
      rmSync(defaultPath, { force: true });
      rmSync(file, { force: true });
   }
});

test("prettyRPCMessage formats all message types", () => {
   expect(prettyRPCMessage([MessageType.REQUEST, 1, "nvim_command", [":q"]], "out")).toEqual({
      OUTGOING_RPC_REQUEST: { reqId: 1, method: "nvim_command", params: [":q"] },
   });

   expect(prettyRPCMessage([MessageType.RESPONSE, 1, null, "result"], "in")).toEqual({
      INCOMING_RPC_RESPONSE: { reqId: 1, error: null, result: "result" },
   });

   expect(prettyRPCMessage([MessageType.NOTIFY, "my_event", ["arg"]], "in")).toEqual({
      INCOMING_RPC_NOTIFICATION: { event: "my_event", args: ["arg"] },
   });
});
