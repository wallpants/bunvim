import { expect, spyOn, test } from "bun:test";
import { generateTypescriptContent, toTypescriptType } from "./generate.ts";
import { type ApiMeta } from "./types.ts";

test("maps known neovim types", () => {
   expect(toTypescriptType("Integer")).toBe("number");
   expect(toTypescriptType("Float")).toBe("number");
   expect(toTypescriptType("String")).toBe("string");
   expect(toTypescriptType("Boolean")).toBe("boolean");
   expect(toTypescriptType("Buffer")).toBe("number");
   expect(toTypescriptType("Window")).toBe("number");
   expect(toTypescriptType("Tabpage")).toBe("number");
   expect(toTypescriptType("Dict")).toBe("Record<string, unknown>");
   expect(toTypescriptType("Dictionary")).toBe("Record<string, unknown>");
   expect(toTypescriptType("Object")).toBe("unknown");
   expect(toTypescriptType("LuaRef")).toBe("unknown");
   expect(toTypescriptType("void")).toBe("void");
   expect(toTypescriptType("Array")).toBe("unknown[]");
});

test("handles ArrayOf variants generically", () => {
   expect(toTypescriptType("ArrayOf(String)")).toBe("string[]");
   expect(toTypescriptType("ArrayOf(Buffer)")).toBe("number[]");
   expect(toTypescriptType("ArrayOf(Dict)")).toBe("Record<string, unknown>[]");
   expect(toTypescriptType("ArrayOf(Integer, 2)")).toBe("[number, number]");
   expect(toTypescriptType("ArrayOf(Integer, 3)")).toBe("[number, number, number]");
});

test("falls back to unknown with a warning on unknown types", () => {
   const warn = spyOn(console, "warn").mockImplementation(() => undefined);
   try {
      expect(toTypescriptType("Mystery")).toBe("unknown");
      expect(warn).toHaveBeenCalledTimes(1);
   } finally {
      warn.mockRestore();
   }
});

test("generateTypescriptContent renders all sections", () => {
   const api: ApiMeta = {
      version: {
         major: 0,
         minor: 11,
         patch: 0,
         prerelease: false,
         api_level: 13,
         api_compatible: 0,
         api_prerelease: false,
      },
      functions: [
         {
            name: "nvim_test",
            since: 1,
            parameters: [
               ["String", "str"],
               ["ArrayOf(Integer, 2)", "pos"],
            ],
            return_type: "Integer",
            method: false,
         },
         {
            name: "nvim_old",
            since: 1,
            deprecated_since: 13,
            parameters: [],
            return_type: "void",
            method: false,
         },
      ],
      ui_events: [{ name: "grid_line", parameters: [["Integer", "grid"]], since: 1 }],
      ui_options: ["rgb"],
      error_types: { Exception: { id: 0 } },
      types: { Buffer: { id: 0, prefix: "nvim_buf_" } },
   };

   const output = generateTypescriptContent(api);

   expect(output).toContain("/* oxlint-disable typescript/no-invalid-void-type */");
   expect(output).toContain("generated against Neovim v0.11.0 (api level 13)");
   expect(output).toContain("nvim_test: {");
   expect(output).toContain("parameters: [str: string, pos: [number, number]];");
   expect(output).toContain("return_type: number;");
   expect(output).toContain("/** @deprecated since api level 13 */\n    nvim_old: {");
   expect(output).toContain("grid_line: {");
   expect(output).toContain("parameters: [grid: number];");
   expect(output).toContain("Exception: { id: 0; };");
   expect(output).toContain('Buffer: { id: 0; prefix: "nvim_buf_"; };');
   expect(output).toContain('ui_options: ["rgb"];');
   expect(output).toContain("notifications: Notifications;");
   expect(output).toContain("requests: Requests;");
});
