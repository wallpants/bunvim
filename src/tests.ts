import { attach } from "./index.ts";
import { logger } from "./logger.ts";

logger.verbose("starting");
const SOCKET = process.env.NVIM;
if (!SOCKET) throw Error("socket missing");

const nvim = await attach<{ "test-notif": [] }>({ socket: SOCKET });
logger.verbose("attached");

const fileName = await nvim.call("nvim_buf_get_name", [0]);
logger.verbose({ fileName });

await nvim.call("nvim_subscribe", ["test-notif"]);
logger.verbose("subscribed");

let counter = 0;

nvim.onNotification("*", async () => {
    logger.verbose("*");
    await nvim.call("nvim_buf_set_lines", [0, 0, 1, true, [`-- *: ${String(counter++)}`]]);
});

nvim.onNotification("test-notif", async () => {
    logger.verbose("test-notif");
    await nvim.call("nvim_buf_set_lines", [0, 1, 2, true, [`-- test-notif: ${String(counter++)}`]]);
});

logger.verbose("registered listeners");
