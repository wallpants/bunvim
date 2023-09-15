import { attach, logger } from "./index.ts";

logger.verbose("starting");
const SOCKET = process.env.NVIM;
if (!SOCKET) throw Error("socket missing");

const nvim = await attach({ socket: SOCKET });
logger.verbose("attached");

await nvim.call("nvim_get_current_line", []);

await nvim.call("nvim_get_api_info", []);
