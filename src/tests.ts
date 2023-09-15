import { attach } from "./index.ts";
import { createLogger } from "./logger.ts";
import { type RequestResponse } from "./types.ts";

const logger = createLogger(process.env.BUNVIM_LOG_FILE, process.env.BUNVIM_LOG_LEVEL);

logger.verbose("starting");
const SOCKET = process.env.NVIM;
if (!SOCKET) throw Error("socket missing");

const nvim = await attach<
    { "*": unknown[]; gual: [string, string] },
    { my_func: [string, number, string, boolean] }
>({
    socket: SOCKET,
});
logger.verbose("attached");

await nvim.call("nvim_set_client_info", ["gualberto", {}, "msgpack-rpc", {}, {}]);

type Channel = { id: number; client?: { name?: string } };
const listChans = (await nvim.call("nvim_list_chans", [])) as Channel[];
const chan = listChans.find((chan) => chan.client?.name === "gualberto");
if (!chan) throw Error("chan not found");

// nvim.onNotification("*", (args) => {});
// nvim.onNotification("gual", (args) => {});

await nvim.call("nvim_create_autocmd", [
    ["CursorHold", "TextChangedI"],
    {
        buffer: 0,
        desc: "some description",
        command: `lua
            local cursor_line = vim.api.nvim_win_get_cursor(0)[1] - 1
            local cursor_move = {
                abs_path = arg.file,
                cursor_line = cursor_line
            }
            vim.rpcnotify(${chan.id}, "cursor_move", cursor_move)`,
    },
]);

// const fileName = await nvim.call("nvim_buf_get_name", [0]);
// logger.verbose({ fileName });

await nvim.call("nvim_subscribe", ["cursor_move"]);
// logger.verbose("subscribed");

// let counter = 0;

// nvim.onNotification("*", (args, event) => {
//     logger.verbose("event", { event, args });
// });

nvim.onRequest("my_func", (_args) => {
    const response: RequestResponse = { error: null, success: { name: "gual" } };
    return response;
});

// await nvim.call("nvim_exec_lua", [
//     `vim.print(vim.rpcrequest(${chan.id}, "func_gual", 1, 2, 3, 4, 5, 6))`,
//     [],
// ]);

// nvim.onNotification("test-notif", async () => {
//     logger.verbose("test-notif");
//     await nvim.call("nvim_buf_set_lines", [0, 1, 2, true, [`-- test-notif: ${String(counter++)}`]]);
// });

// logger.verbose("registered listeners");
