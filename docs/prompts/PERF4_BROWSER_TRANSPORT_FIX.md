# PERF4 Browser Transport Fix

## Recommended execution configuration

- Model: GPT-6 Astra
- Reasoning: High
- Surface: current Codex CLI session in WSL
- Repository working directory: `/home/ary/Developer/bloomops`

You are fixing only the Chrome DevTools transport used by Codex in WSL before resuming PERF4. Do not deploy anything and do not modify the BloomOps repository.

## Root cause

The current failure is no longer MCP tool injection. `chrome_devtools.list_pages` is callable, but returns:

`Protocol error (Target.setDiscoverTargets): Target closed`

This is a known WSL failure mode when a Linux `chrome-devtools-mcp` process discovers/launches Windows `chrome.exe` through `/mnt/c`. The CDP pipe closes and target discovery fails. Do not keep retrying that topology.

The goal is to attach to the already-running Windows Chrome profile that contains the existing authenticated staging session, instead of launching Windows Chrome from the WSL-side MCP process.

## Safety / scope

- Do not deploy staging or production.
- Do not alter BloomOps source, docs, tests, branches, commits, config, schema, migrations, or evidence.
- Do not open a PR or merge.
- Do not enable Worker Logs, invocation logs, traces, tailing, or broad browser logging.
- Do not change Cloudflare authentication.
- Do not begin PERF4 measurements yet.
- Preserve the existing MCP privacy flags:
  - `--no-usage-statistics`
  - `--no-performance-crux`
- Do not use an isolated/headless/new browser profile for Gate B because the required session is the existing signed-in Windows Chrome profile.

## Step 1: inspect current MCP registration

Record the current non-secret registration:

```bash
codex mcp get chrome_devtools
```

Confirm the server is currently WSL-side and that it is not already explicitly attaching to an existing Windows Chrome session.

## Step 2: prove Windows-side MCP execution is available

From WSL, probe Windows `cmd.exe` and Windows Node/npm without changing anything:

```bash
/mnt/c/Windows/System32/cmd.exe /d /s /c "where node && where npx"
```

If this succeeds, use **Path A** below. Path A is preferred because the MCP server itself runs on Windows and can use Chrome's supported `--autoConnect` flow against the existing Windows profile.

If Windows `node`/`npx` is unavailable, use **Path B** below instead. Do not install Node just for this task.

---

# Path A — preferred: run the MCP server on Windows and auto-connect to the existing Chrome profile

## A1. Ensure Windows Chrome remote debugging is enabled

Open the following page in the user's already-running Windows Chrome instance:

`chrome://inspect/#remote-debugging`

You may use Windows shell integration only to open this URL in the existing Chrome app if needed. Do not launch a separate Chrome profile.

The user must enable **Allow remote debugging for this browser instance** if it is not already enabled.

Do not claim this is enabled unless it is actually confirmed.

## A2. Replace only the global MCP command transport

Keep the MCP key exactly:

`chrome_devtools`

Replace its command so the MCP server runs via Windows `cmd.exe`, not Linux `npx`.

Use the equivalent of:

```text
command = /mnt/c/Windows/System32/cmd.exe
args = /d /s /c npx -y chrome-devtools-mcp@latest --autoConnect --no-usage-statistics --no-performance-crux
```

Use Codex's MCP CLI if it can express this correctly. Otherwise make the narrowest possible edit to the global Codex config only. Do not edit repository files.

Important:
- include `--autoConnect`
- preserve both privacy flags
- do not add `--isolated`
- do not add `--headless`
- do not add `--executablePath`
- do not add `--browser-url`
- do not point to a temporary profile

Validate the resulting registration with:

```bash
codex mcp get chrome_devtools
```

The non-secret command/args should clearly show Windows `cmd.exe` + Windows `npx` + `--autoConnect`.

## A3. Stop current Codex session

MCP transport changes require a fresh Codex session. Stop here and tell the user to fully exit Codex CLI and start a fresh session in `/home/ary/Developer/bloomops`.

In the fresh session, the very first browser acceptance test must be an actual `chrome_devtools.list_pages` call.

When Chrome prompts to allow the incoming debugging connection, the user must click **Allow**.

Gate B passes only if `list_pages` returns the user's real existing Chrome pages and the staging session can then be verified as authenticated.

If `list_pages` still fails, report the exact error and the non-secret MCP command/args. Do not revert to WSL launching Windows Chrome.

---

# Path B — fallback when Windows Node/npx is unavailable

Do not install extra runtimes. Instead attach the WSL MCP process directly to the already-running Windows Chrome websocket endpoint.

## B1. Enable remote debugging in the existing Windows Chrome

In the already-running Windows Chrome profile, open:

`chrome://inspect/#remote-debugging`

Enable **Allow remote debugging for this browser instance**.

## B2. Locate the Windows Chrome user-data directory

Determine `%LOCALAPPDATA%` using Windows shell:

```bash
/mnt/c/Windows/System32/cmd.exe /d /s /c "echo %LOCALAPPDATA%"
```

The usual Chrome user-data directory is:

`%LOCALAPPDATA%\Google\Chrome\User Data`

Map that path to `/mnt/c/...` and look for `DevToolsActivePort` in the user-data directory. Do not inspect cookies, Local Storage, browsing history, or other profile data.

If `DevToolsActivePort` exists, read only that file. It should contain a port on line 1 and a `/devtools/browser/...` path on line 2.

## B3. Determine Windows host reachability from WSL

First test whether the listed Chrome port is reachable at WSL `127.0.0.1`.

If not, determine the Windows host IP using the WSL default gateway and test that same port there.

Do not expose the endpoint outside the local machine.

Construct the websocket endpoint as:

`ws://HOST:PORT/devtools/browser/...`

using the exact path from `DevToolsActivePort`.

## B4. Reconfigure only the MCP connection

Keep Linux `npx`, but change the `chrome_devtools` args to include:

`--wsEndpoint=<constructed local websocket endpoint>`

and preserve:

- `--no-usage-statistics`
- `--no-performance-crux`

Do not include `--autoConnect`, `--browser-url`, `--isolated`, `--headless`, or `--executablePath` in this fallback.

Then stop the current Codex session and require one fresh session. In that fresh session, call `chrome_devtools.list_pages` first. Gate B passes only if it returns the user's existing Chrome pages and the authenticated staging session can be verified.

If `DevToolsActivePort` is absent, do not invent an endpoint and do not launch a new debug profile. Report that Path B cannot preserve the existing session.

---

## After Gate B passes

Only after an actual `list_pages` succeeds against the user's existing Windows Chrome profile and the staging browser is verified authenticated:

1. Fetch origin.
2. Read `docs/prompts/PERF4_STAGING_RESUME.md` from `origin/ops/perf4-staging-correlation-prompt`.
3. Resume at Gate B completion.
4. Re-check `wrangler whoami` before deployment.
5. Follow the resume prompt exactly.

Do not deploy before Gate B passes.

## What to report

Report exactly one of these outcomes:

1. `PATH A CONFIGURED — RESTART ONCE` plus the non-secret Windows-side MCP command/args, or
2. `PATH B CONFIGURED — RESTART ONCE` plus whether localhost or Windows-host-IP transport was selected, without exposing unrelated profile data, or
3. `BLOCKED` with the exact technical prerequisite that is absent.

Do not tell the user to repeatedly restart unchanged configuration.