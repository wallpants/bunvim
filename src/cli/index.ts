import { program } from "commander";
import { version } from "../../package.json";

program.name("bunvim").description("CLI to work the neovim's bun client").version(version);

program
    .command("logs")
    .description("print logs")
    .argument("<client name>", "Client name you specify in your attach call")
    .action((name) => {
        Bun.spawn({
            cmd: ["tail", "-F", "-n", "0", `/tmp/${name}.bunvim.logs`],
            stdin: null,
            stdout: "inherit",
        });
    });

program.parse();
