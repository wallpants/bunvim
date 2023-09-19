import { attach } from "./index.ts";
import { type NeovimApi } from "./neovim.types.ts";

const SOCKET = process.env["NVIM"];
if (!SOCKET) throw Error("socket missing");

const nvim = await attach<NeovimApi>({
    socket: SOCKET,
    client: { name: "bunvim" },
    logging: { level: "debug" },
});

await nvim.call("nvim_subscribe", ["something"]);

nvim.onNotification("something", () => {
    nvim.logger?.verbose("something 1");
    return 1;
});

nvim.onNotification("something", () => {
    nvim.logger?.verbose("something 2");
    return false;
});

nvim.onNotification("something", () => {
    nvim.logger?.verbose("something 3");
    return "string";
});

nvim.onNotification("something", () => {
    nvim.logger?.verbose("something 4");
    return true;
});

nvim.onNotification("something", () => {
    nvim.logger?.verbose("something 5");
    return;
});

nvim.onNotification("something", () => {
    nvim.logger?.verbose("something 6");
    return true;
});

nvim.onNotification("something", () => {
    nvim.logger?.verbose("something 7");
});

nvim.onNotification("something", () => {
    nvim.logger?.verbose("something 8");
});

nvim.onNotification("something", () => {
    nvim.logger?.verbose("something 9");
    return true;
});

nvim.onNotification("something", () => {
    nvim.logger?.verbose("something 10");
});
