import { attach } from "./index.ts";

const SOCKET = process.env.NVIM;
if (!SOCKET) throw Error("socket missing");

const nvim = await attach({ socket: SOCKET });

await nvim.call("nvim_get_current_line", []);
await nvim.call("nvim_get_api_info", []);
