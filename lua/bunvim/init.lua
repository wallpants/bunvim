--
--
local M = {}

M.log = function(_, data)
	vim.print(data)
end

M.setup = function()
	local function start_server()
		local __filename = debug.getinfo(1, "S").source:sub(2)
		local plugin_root = vim.fn.fnamemodify(__filename, ":p:h:h:h") .. "/"

        -- stylua: ignore
		local job = vim.fn.jobstart("bun run src/tests.ts", {
            -- rpc = true,
			cwd = plugin_root,
            on_exit = function(_, data) vim.print(data) end,
			on_stderr = function(_, data) vim.print(data) end,
		})

		-- vim.print("job: ", job)

		vim.api.nvim_create_autocmd({ "CursorHoldI", "CursorHold" }, {
			callback = function()
				-- vim.print("running")
				vim.rpcnotify(job, "test-notif")
			end,
		})
	end

	vim.api.nvim_create_user_command("GithubPreview", start_server, {})
end

return M
