local M = {}

---@type number
local channel_id = nil

local function client_channel(client_name)
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
	local function start_server()
		local __filename = debug.getinfo(1, "S").source:sub(2)
		local plugin_root = vim.fn.fnamemodify(__filename, ":p:h:h:h") .. "/"

		vim.fn.jobstart("bun run src/tests.ts", {
			cwd = plugin_root,
			stdin = "null",
		})

		-- vim.api.nvim_create_autocmd({ "CursorHoldI", "CursorHold" }, {
		-- 	callback = function()
		-- 		vim.rpcnotify(client_channel("gualberto"), "test-notif")
		-- 	end,
		-- })
	end

	vim.api.nvim_create_user_command("GithubPreview", start_server, {})
end

return M
