# Bunvim

<img src="docs/nvim.svg" height="60px" align="right" />
<img src="docs/bun.svg" height="60px" align="right" />

Bunvim is a [Bun](https://bun.sh/) client that allows you to interact with Neovim through RPC
using TypeScript and JavaScript. If you're familiar with Neovim's Lua API, you'll find this client easy to use.

This client includes [TypeScript definitions](https://github.com/wallpants/bunvim/blob/main/src/neovim-api.types.ts),
generated from [Neovim's api-metadata](https://neovim.io/doc/user/api.html#api-metadata), describing API function signatures,
including function parameters and return values.

All functionality is implemented in [one file](https://github.com/wallpants/bunvim/blob/main/src/attach.ts).
If you're looking for higher levels of abstraction, take a look at [neovim/node-client](https://github.com/neovim/node-client)
and [neoclide/neovim](https://github.com/neoclide/neovim). Good luck.

## Requirements

-   [Bun](https://bun.sh/)
-   [Neovim](https://neovim.io/)

## Installation

```sh
bun install bunvim
```

## Usage

For examples of plugins using Bunvim, take a look at [ghost-text.nvim](https://github.com/wallpants/ghost-text.nvim) and [github-preview.nvim](https://github.com/wallpants/github-preview.nvim).

You should keep a tab open with [Neovim API docs](https://neovim.io/doc/user/api.html) when working with Bunvim.
Although this client includes generated TypeScript types, you'll find the detailed descriptions in the official docs very helpful if not necessary.

Create a script:

```typescript
// my-plugin.ts
import { attach } from "bunvim";

// RPC listenning address
const SOCKET = "/tmp/bunvim.nvim.socket";

const nvim = await attach({
    socket: SOCKET,
    client: { name: "my-plugin-name" },
});

// append "hello world" to current buffer
await nvim.call("nvim_buf_set_lines", [0, -1, -1, true, ["hello world"]]);

// disable relative numbers
await nvim.call("nvim_set_option_value", ["relativenumber", false, {}]);

// create a vertical split
await nvim.call("nvim_command", ["vs"]);

// print cursor position on cursor move
await nvim.call("nvim_create_autocmd", [
    ["CursorHold", "CursorHoldI"],
    {
        desc: "Print Cursor Position",
        command: `lua
            local cursor_pos = vim.api.nvim_win_get_cursor(0)
            vim.print(cursor_pos)`,
    },
]);

nvim.detach();
```

Initialize Neovim with the [RPC listening address](https://neovim.io/doc/user/starting.html#--listen) specified above:

```bash
nvim --listen /tmp/bunvim.nvim.socket
```

Execute your script from another terminal:

```sh
bun run my-plugin.ts
```

If your plugin is executed as a child process of Neovim:

```lua
-- somewhere in your neovim lua config files

local function run_script()

    -- neovim sets the environment variable NVIM in all its child processes
    -- NVIM = the RPC listening address assigned to the current neovim instance
    -- neovim sets an RPC listening address if you don't manually specify one
    -- https://neovim.io/doc/user/builtin.html#jobstart-env

    vim.fn.jobstart("bun run my-plugin.ts", {
        cwd = vim.fn.expand("~/path/to/plugin/"),
    })
end

vim.api.nvim_create_user_command("RunMyScript", run_script, {})
```

You could then open Neovim without manually specifying an RPC listening address, just `nvim` and then run the command `:RunMyScript`.
Your Bun process would then have access to the `NVIM` environment variable.

```typescript
// my-plugin.ts
import { attach } from "bunvim";

const SOCKET = process.env["NVIM"];
if (!SOCKET) throw Error("socket missing");

const nvim = await attach({
    socket: SOCKET,
    client: { name: "my-plugin-name" },
});
```

## API Reference

This module exports only one method `attach` and a bunch of TypeScript types. `attach` returns
an `Nvim` object that can be used to interact with Neovim.

<details>
    <summary>
        <code>nvim.call(function: string, args: unknown[])</code>
    </summary>

>

> Used to call [any of these functions](https://neovim.io/doc/user/api.html). They're all typed. You should
> get function names autocompletion & warnings from TypeScript if the parameters don't match the expected types.
> Some function calls return a value, others don't.
>
> ```typescript
> const bufferContent = await nvim.call("nvim_buf_get_lines", [0, 0, -1, true]);
> ```

> ---

</details>

<details>
    <summary>
        <code>nvim.channelId()</code>
    </summary>

>

> Calls [`nvim_get_api_info`](<https://neovim.io/doc/user/api.html#nvim_get_api_info()>)
> and returns the RPC Channel ID included in the response. Channel ID is memoized for future calls.
>
> ```typescript
> const channelId = await nvim.channelId();
> ```

> ---

</details>

<details>
    <summary>
        <code>nvim.onNotification(notification: string, callback: function)</code>
    </summary>

>

> Registers a handler for a specific RPC Notification.
>
> Notifications must be typed before you declare a handler for them, or TypeScript will complain.
>
> ```typescript
> import { attach, type BaseEvents, type EventsMap } from "bunvim";
>
> // an interface to define your notifications and their args
> interface MyEvents extends BaseEvents {
>     requests: EventsMap; // default type
>     notifications: {
>         // declare custom notification: "cursor_move",
>         // that would be called with args: [row: number, col: number]
>         "cursor_move": [row: number, col: number];
>     };
> }
>
> // attach to neovim
> const nvim = await attach<MyEvents>({ ... })
>
> let count = 0;
>
> // register a handler for the notification "cursor_move"
> nvim.onNotification("cursor_move", async ([row, col]) => {
>     // "row" and "col" are of type "number" as specified above
>
>     // CAUTION:
>     // it's up to you to make sure the handler receives the correct args,
>     // bunvim doesn't do any validations
>
>     // print row and col in neovim
>     await nvim.call("nvim_exec_lua", [`print("row: ${row} - col: ${col}")`, []]);
>
>     // return `true` to remove handler
>     return count++ >= 5;
> });
>
> // multiple handlers can be registered for the same notification
> nvim.onNotification("cursor_move", async ([row, col]) => {
>     // replace contents in current buffer lines 1 and 2
>     await nvim.call("nvim_buf_set_lines", [0, 0, 2, true, [`row: ${row}`, `col: ${col}`]]);
> });
>
> const channelId = await nvim.channelId();
>
> // create autocommand to notify our plugin via `vim.rpcnotify`
> // whenever the cursor moves
> await nvim.call("nvim_create_autocmd", [
>     ["CursorHold", "CursorHoldI"],
>     {
>         desc: "Notify on Cursor Move",
>         command: `lua
>             local cursor_pos = vim.api.nvim_win_get_cursor(0)
>             local row = cursor_pos[1]
>             local col = cursor_pos[2]
>             vim.rpcnotify(${channelId}, "cursor_move", row, col)`,
>     },
> ]);
> ```

> ---

</details>

<details>
    <summary>
        <code>nvim.onRequest(request: string, callback: function)</code>
    </summary>

>

> Registers a handler for a specific RPC Request.
>
> Requests must be typed before you declare a handler for them, or TypeScript will complain.
>
> The difference between an RPC Notification and an RPC Request, is that requests block neovim
> until a response is returned. Notifications are non-blocking.
>
> ```typescript
> import { attach, type BaseEvents, type EventsMap } from "bunvim";
> import { gracefulShutdown } from "./utils.ts";
>
> // an interface to define your requests and their args
> interface MyEvents extends BaseEvents {
>     notifications: EventsMap; // default type
>     requests: {
>         // declare custom request: "before_exit",
>         // that would be called with args: [bufferName: string]
>         "before_exit": [bufferName: string];
>     };
> }
>
> // attach to neovim
> const nvim = await attach<MyEvents>({ ... })
>
> // register a handler for the request "before_exit"
> nvim.onRequest("before_exit", async ([bufferName]) => {
>     // "bufferName" is of type "string" as specified above
>
>     // CAUTION:
>     // it's up to you to make sure the handler receives the correct args,
>     // bunvim doesn't do any validations
>
>     // this should actually never get called,
>     // because this handler gets overwritten below
>     console.log("bufferName: ", bufferName);
>
>     // we must return something to unblock neovim
>     return null;
> });
>
> // only one handler per request may be registered.
> // if you call `nvim.onRequest` for an already registered handler,
> // the older handler is replaced with the new one.
> nvim.onRequest("before_exit", async ([bufferName]) => {
>     gracefulShutdown(bufferName);
>     return null;
> });
>
> const channelId = await nvim.channelId();
>
> // create autocommand to call our function via `vim.rpcrequest`
> // whenever neovim is about to close
> await nvim.call("nvim_create_autocmd", [
>     ["VimLeavePre"],
>     {
>         desc: "RPC Request before exit",
>         command: `lua
>             local buffer_name = vim.api.nvim_get_current_buf()
>             vim.rpcrequest(${channelId}, "before_exit", buffer_name)`,
>     },
> ]);
> ```

> ---

</details>

<details>
    <summary>
        <code>nvim.detach()</code>
    </summary>

>

> Closes connection with neovim.
>
> ```ts
> nvim.detach();
> ```

> ---

</details>

<details>
    <summary>
        <code>nvim.logger</code>
    </summary>

>

> Instance of [winston logger](https://github.com/winstonjs/winston).
> May be `undefined` if logging was not enabled.
>
> Used to log data to console and/or file. Does not log/print messages to Neovim.
>
> [See Logging](#logging).
>
> ```typescript
> // log functions sorted from highest to lowest priority:
>
> nvim.logger?.error("error message");
> nvim.logger?.warn("warn message");
> nvim.logger?.info("info message");
> nvim.logger?.http("http message");
> nvim.logger?.verbose("verbose message");
> nvim.logger?.debug("debug message");
> nvim.logger?.silly("silly message");
> ```

> ---

</details>

## Logging

To enable logging to **Console** and/or **File**, a logging `level` must be specified when calling the `attach` method:

```typescript
const nvim = await attach({
    socket: SOCKET,
    client: { name: "my-plugin-name" },
    logging: {
        level: "debug", // <= LOG LEVEL
    },
});

nvim.logger?.info("hello world");
```

### Console

After setting a log `level`, you can see your logs live with the command `bunvim logs` and
specifying the `client.name` you defined in your `attach`.

In a terminal, run the command:

```sh
# this process will listen for logs and print them to the console
# Ctrl-C to stop process

bunx bunvim logs my-plugin-name
```

For more information about the CLI tool, run the command:

```sh
bunx bunvim --help
```

### File

You can also write your logs to a `file` by specifying a path when calling the `attach` method:

```typescript
const nvim = await attach({
    socket: SOCKET,
    client: { name: "my-plugin-name" },
    logging: {
        level: "debug", // <= LOG LEVEL
        file: : "~/my-plugin-name.log" // <= PATH TO LOG FILE
    },
});
```

### Neovim

If you want to log/print a message to the user in Neovim, use:

```typescript
/* levels according to `:lua vim.print(vim.log.levels)` */
import { NVIM_LOG_LEVELS } from "bunvim";

await nvim.call("nvim_notify", ["some message", NVIM_LOG_LEVELS.INFO, {}]);
```

## Roadmap

-   [x] write API Reference
-   [ ] write tests
-   [ ] cli should throw error if we provide extra args, `bun bunvim types src` doesn't throw and it should
-   [ ] fix type inference for ui events
