import { attach } from "./index.ts";
import { type NeovimApi } from "./neovim.types.ts";

const SOCKET = process.env["NVIM"];
if (!SOCKET) throw Error("socket missing");

const nvim = await attach<NeovimApi>({
    socket: SOCKET,
    client: { name: "bunvim" },
    logging: { level: "debug" },
});

await nvim.call("nvim_ui_attach", [9999, 9999, {}]);

// nvim.detach();
