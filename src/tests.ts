import { attach } from "./index.ts";

const SOCKET = process.env["NVIM"];
if (!SOCKET) throw Error("socket missing");

type MyEvents = {
    notifications: {
        "some-notification": [name: string, id: number];
    };
    requests: {
        "some-request": [name: string];
    };
};

const nvim = await attach<MyEvents>({
    socket: SOCKET,
    client: { name: "bunvim" },
    logging: { level: "debug" },
});

// await nvim.call("nvim_ui_attach", [9999, 9999, {}]);
await nvim.call("nvim_get_current_buf", []);

nvim.onNotification("some-notification", ([name, id]) => {
    console.log("name: ", name);
    console.log("id: ", id);
});

// nvim.detach();
