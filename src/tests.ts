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

await nvim.call("nvim_ui_attach", [500, 500, {}]);

nvim.onNotification("redraw", (events) => {
    events.forEach(([event, args]) => {
        if (event === "scroll") {
            // TODO(gualcasas): args[0] is not properly inferred
            const val = args[0];
            console.log("val: ", val);
        }
    });
});

nvim.detach();
