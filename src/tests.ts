import { attach } from "./index.ts";

const SOCKET = "/run/user/1000/nvim.86978.0";
const nvim = await attach({ socket: SOCKET });

await nvim.call("nvim_subscribe", ["my_rpc_notification"]);

// both these handlers would run
// on a `my_rpc_notification` notification
nvim.onNotification("*", (args) => {
    console.log(args);
});

nvim.onNotification("my_rpc_notification", (args) => {
    console.log(args);
});

nvim.detach();
