# PERF4 Chrome DevTools MCP Repair

## Recommended execution configuration

- Model: GPT-6 Astra
- Reasoning: High
- Surface: current Codex CLI session in WSL
- Repository working directory: `/home/ary/Developer/bloomops`

You are repairing only the global Codex Chrome DevTools MCP registration before resuming PERF4. Do not deploy anything and do not modify the BloomOps repository.

## Why this repair is being attempted

The current global MCP server is named `chrome-devtools`. Codex has had a 2026 regression where MCP server keys containing a hyphen can appear configured/enabled while their callable tools are not injected into the model session. Rename only the MCP registration key to an underscore form and preserve the server command/arguments.

## Safety / scope

- Do not deploy staging or production.
- Do not alter BloomOps source, docs, tests, config, branches, or commits.
- Do not open a PR or merge.
- Do not enable Worker Logs, invocation logs, traces, or tailing.
- Do not begin PERF4 measurements yet.
- Do not change Cloudflare authentication.
- Do not expose secrets.
- Do not add broad debug logging to the Chrome session.

## Repair steps

1. Confirm the current MCP registration and record its non-secret command/args:

   `codex mcp get chrome-devtools`

2. Confirm `npx` is available in this WSL shell:

   `command -v npx`

3. Remove only the old MCP registration named exactly:

   `chrome-devtools`

4. Re-create the same MCP server under this key instead:

   `chrome_devtools`

   Preserve the existing command and functional arguments exactly. Preserve the existing privacy flags if present, including:

   - `--no-usage-statistics`
   - `--no-performance-crux`

   Do not add `--isolated`, headless mode, a different Chrome profile, or a browser URL during this rename-only repair.

   Prefer the Codex CLI registration command rather than hand-editing unrelated config. The resulting server name must be `chrome_devtools` with an underscore.

5. Verify:

   - `codex mcp list`
   - `codex mcp get chrome_devtools`

   Confirm the old `chrome-devtools` key is gone and the new `chrome_devtools` key is enabled.

6. Stop. Do not attempt the staging deployment or PERF4 capture in this same Codex session, because MCP tool injection is established at session startup.

## What to tell the user

Tell the user to exit this Codex CLI session completely and start a fresh Codex CLI session in `/home/ary/Developer/bloomops`.

In the fresh session, do NOT use `/mcp` display alone as the acceptance test. Codex has also had a separate status-display bug where `/mcp` can show `Tools: (none)` even though tools are callable.

The fresh-session acceptance test is an actual Chrome DevTools tool call:

- attempt the Chrome DevTools `list_pages` tool from server `chrome_devtools`.

If that tool is callable, Gate B MCP exposure passes even if `/mcp` renders an empty tool list.

If `list_pages` is not callable, report:

- `codex --version`
- whether `codex mcp get chrome_devtools` shows the server enabled
- the non-secret command/args
- the exact model-visible error when attempting `list_pages`

Do not deploy until an actual Chrome DevTools tool call succeeds and the existing signed-in staging browser is verified.

After `list_pages` succeeds, resume `docs/prompts/PERF4_STAGING_RESUME.md` from `origin/ops/perf4-staging-correlation-prompt` at Gate B. All original PERF4 safety restrictions remain in force.
