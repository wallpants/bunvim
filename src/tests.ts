import { attach } from "./index.ts";
import { type NeovimApi } from "./neovim.types.ts";

const SOCKET = process.env["NVIM"];
if (!SOCKET) throw Error("socket missing");

const nvim = await attach<NeovimApi>({
    socket: SOCKET,
    client: { name: "bunvim" },
    logging: { level: "debug" },
});

const chanId = await nvim.channelId();
nvim.logger?.info("chanId", { chanId });
