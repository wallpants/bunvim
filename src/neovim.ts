// import { attach } from "neovim";
import { attach, logger } from "./index.ts";

const SOCKET = process.env.NVIM;
if (!SOCKET) throw Error("socket missing");

const nvim = await attach({ socket: SOCKET });

nvim.onNotification("*", (args, notification) => {
    logger.warn(notification, { args });
});

await nvim.call("nvim_get_current_line", []);

await nvim.call("nvim_get_api_info", []);

await nvim.call("nvim_buf_attach", [0, true, {}]);

// const apiInfo = await nvim.apiInfo;
// logger.warn(apiInfo);
