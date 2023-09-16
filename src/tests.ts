import { attach } from "./index.ts";

const SOCKET = process.env.NVIM;
const LOG_FILE = process.env.BUNVIM_LOG_FILE;
const LOG_LEVEL = process.env.BUNVIM_LOG_LEVEL;

if (!SOCKET) throw Error("socket missing");

const nvim = await attach({ socket: SOCKET, logFile: LOG_FILE, logLevel: LOG_LEVEL });
// const nvim = await attach({ socket: SOCKET });
nvim.logger?.info("hello 1");

await nvim.call("nvim_get_current_line", []);
await nvim.call("nvim_get_current_buf", []);
// await nvim.call("nvim_get_api_info", []);
nvim.detach();
