import { attach } from "./index.ts";
import { logger } from "./logger.ts";

logger.verbose("starting");
const SOCKET = process.env.NVIM;
if (!SOCKET) throw Error("socket missing");

const nvim = await attach<{ "test-notif": [] }>({ socket: SOCKET });
logger.verbose("attached");

await nvim.call("nvim_set_client_info", ["gualberto", {}, "msgpack-rpc", {}, {}]);
const autocmd = await nvim.call("nvim_create_autocmd", [
    "CursorHold",
    {
        buffer: 0,
        desc: "some description",
        command: 'lua vim.rpcnotify(0, "test-notif")',
    },
]);

logger.verbose({ autocmd });

// const fileName = await nvim.call("nvim_buf_get_name", [0]);
// logger.verbose({ fileName });

await nvim.call("nvim_subscribe", ["test-notif"]);
// logger.verbose("subscribed");

// const listChans = await nvim.call("nvim_list_chans", []);
// logger.verbose("listChans", { listChans });
await nvim.call("nvim_buf_attach", [0, true, {}]);

// let counter = 0;

nvim.onNotification("*", (args, event) => {
    logger.verbose("event", { event, args });
});

// nvim.onNotification("test-notif", async () => {
//     logger.verbose("test-notif");
//     await nvim.call("nvim_buf_set_lines", [0, 1, 2, true, [`-- test-notif: ${String(counter++)}`]]);
// });

logger.verbose("registered listeners");
