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

You should keep a tab open with [Neovim Api docs](https://neovim.io/doc/user/api.html) when working with Bunvim.
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

This module exports only one method (`attach`) and a bunch of TypeScript types.

```typescript
// my-plugin.ts
import { attach } from "bunvim";

const SOCKET = process.env["NVIM"];
if (!SOCKET) throw Error("socket missing");

const nvim = await attach({
    socket: SOCKET, // REQUIRED
    client: {
        name: "my-plugin-name", // REQUIRED
    },
});
```

## Roadmap

-   [ ] write API Reference
-   [ ] write tests
-   [ ] cli should throw error if we provide extra args, `bun bunvim types src` doesn't throw and it should
-   [ ] fix type inference for ui events
