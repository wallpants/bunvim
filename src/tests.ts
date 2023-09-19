import { attach, type BaseApiInfo } from "./index.ts";

const SOCKET = process.env.NVIM;
if (!SOCKET) throw Error("socket missing");

type NofificationsMap = {
    something: [buff: number, name: string, height: number];
};

type RequestsMap = {
    something: [string, number];
};

type MyNvim = BaseApiInfo<NofificationsMap, RequestsMap>;

const nvim = await attach<MyNvim>({
    socket: SOCKET,
    client: { name: "bunvim" },
});

nvim.onNotification("something", (arg) => {
    console.log("arg: ", arg);
});

nvim.onRequest("something", (arg) => {
    return arg;
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
await nvim.call("nvim_get_api_info", []);
// await nvim.call("nvim_get_current_win", []);
// await nvim.call("nvim_get_current_tabpage", []);
nvim.detach();
