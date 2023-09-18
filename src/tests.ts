import { attach } from "./index.ts";

const SOCKET = process.env.NVIM;
if (!SOCKET) throw Error("socket missing");

const nvim = await attach({
    socket: SOCKET,
    client: { name: "bunvim" },
    logging: {
        level: "debug",
        file: "./test-file.logs",
    },
});

// await nvim.call("nvim_exec_lua", [
//     `
//     local function my_func(name)
//         vim.print("hello " .. name)
//     end

//     return my_func(...)
// `,
//     ["gual"],
// ]);
await nvim.call("nvim_get_current_buf", []);
await nvim.call("nvim_get_current_win", []);
await nvim.call("nvim_get_current_tabpage", []);
nvim.detach();
