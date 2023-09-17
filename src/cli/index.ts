import { program } from "commander";
import { version } from "../../package.json";

program.name("bunvim").description("CLI to work the neovim's bun client").version(version);

program
    .command("logs")
    .description("print logs")
    .option("-o, --out <path>", "Path to log file", "/tmp/bunvim.log")
    .option("-l, --level <level>", "Log level", "debug")
    .action(({ out, level }) => {
        Bun.spawn({ cmd: ["tail", "-F", "-n", "0", out], stdin: null, stdout: "inherit" });
        console.log("out: ", out);
        console.log("level: ", level);
    });

program.parse();
