local M = {}

---@type number
local channel_id = nil

---@param client_name string
local function client_channel(client_name)
	-- this method should return rpc client channel id
	-- after having called the following in bun:
	-- await nvim.call("nvim_set_client_info", [client_name, {}, "msgpack-rpc", {}, {}]);

	if channel_id ~= nil then
		-- return memoized
		return channel_id
	end

	for _, chan in ipairs(vim.api.nvim_list_chans()) do
		if chan.client and chan.client.name == client_name then
			-- memoize and return
			channel_id = chan.id
			return channel_id
		end
	end

	-- return broadcast channel if client not found
	return 0
end

M.setup = function()
	local function start_bun_script()
		local __filename = debug.getinfo(1, "S").source:sub(2)
		local plugin_root = vim.fn.fnamemodify(__filename, ":p:h:h:h") .. "/"
		vim.fn.jobstart("bun run src/neovim.ts", {
			cwd = plugin_root,
			stdin = "null",
		})
	end

	local function rpc_request()
		local response = vim.rpcrequest(client_channel("gualberto"), "func_gual", { 1, 5, 6, 7 })
		vim.print(response)
	end

	vim.api.nvim_create_user_command("BunStart", start_bun_script, {})
	vim.api.nvim_create_user_command("BunRequest", rpc_request, {})
end

return M
