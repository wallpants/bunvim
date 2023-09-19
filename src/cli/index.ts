#!/usr/bin/env bun
import { InvalidOptionArgumentError, program } from "commander";
import { unpack } from "msgpackr";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { version } from "../../package.json";
import { generateTypescriptContent } from "./generate.ts";
import { type NeovimApi } from "./types.ts";

program.name("bunvim").description("CLI to work with neovim's bun client").version(version);

program
    .command("logs")
    .description("print bunvim client logs")
    .argument("<client_name>", "Client name you specify in your attach call.")
    .action((name) => {
        Bun.spawn({
            cmd: ["tail", "-F", "-n", "0", `/tmp/${name}.bunvim.logs`],
            stdin: null,
            stdout: "inherit",
        });
    })
    .exitOverride(() => process.exit(0));

function validateLevel(value: string) {
    const parsedInt = parseInt(value, 10);
    if (isNaN(parsedInt)) {
        throw new InvalidOptionArgumentError("\nNot a number.");
    }
    return parsedInt;
}

function validateOutDir(value: string) {
    const resolved = resolve(value);
    if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
        throw new InvalidOptionArgumentError(`\nDirectory "${resolved}" not found.`);
    }
    return resolved;
}

program
    .command("types")
    .description("generate api types using your local neovim")
    .option(
        "-o, --outDir <path>",
        "Path to dir where types file will be created.",
        validateOutDir,
        ".",
    )
    .option(
        "-l, --level <number>",
        "Include info up to specified api level (inclusive). Leave unset to include all. Deprecated items are excluded by default.",
        validateLevel,
    )
    .action(async ({ level, outDir }: { level?: number; outDir?: string }) => {
        const process = Bun.spawnSync({ cmd: ["nvim", "--api-info"] });
        const neovimApi = unpack(process.stdout) as NeovimApi;

        neovimApi.functions = neovimApi.functions.filter((fn) => {
            if (fn.deprecated_since !== undefined) return false;
            if (level !== undefined && fn.since > level) return false;
            return true;
        });

        const content = generateTypescriptContent(neovimApi);

        const segments: string[] = ["neovim.types.ts"];
        if (outDir) segments.unshift(outDir);
        const resolved = resolve(...segments);

        console.log(`\nGenerating types at:\n* ${resolved}\n`);
        await Bun.write(resolved, content);
    })
    .exitOverride(() => process.exit(0));

await program.exitOverride(() => process.exit(0)).parseAsync();
