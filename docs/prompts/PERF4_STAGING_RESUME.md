# PERF4 Staging Correlation Resume Prompt

## Recommended execution configuration

- Model: GPT-6 Astra
- Reasoning: High
- Surface: Codex CLI
- Working repository: `/home/ary/Developer/bloomops`

You are resuming the bounded BloomOps PERF4 signed-in staging correlation after the first authorized attempt stopped before upload.

Read first:

- `docs/prompts/PERF4_STAGING_CORRELATION.md` from this prompt branch
- `docs/BUILD_STATE.md` at `origin/perf/perf4-staging-timing-integration`
- `docs/PERF4_RESULTS.md` at `origin/perf/perf4-staging-timing-integration`

This resume prompt OVERRIDES the original prompt only where stated below. All original safety restrictions, measurement requirements, privacy restrictions, no-PR/no-merge/no-D2/no-optimization rules remain in force.

## Exact provenance

Repository: `Beeyach/bloomops`

Evidence branch: `perf/perf4-staging-timing-integration`

Current evidence/handoff branch SHA at authorization time:

`2807704f29e39d2d0918167e9be3baf855fb33ba`

That commit is documentation/evidence only and MUST NOT be substituted for the application candidate.

**EXACT authorized application/deployment candidate remains:**

`6da1c2467ae0a4ae31bcefcd1ca16482c7f5bae5`

The application/runtime source at that SHA remains the verified candidate. Do not deploy the prompt branch or the evidence-only branch head.

## Correction 1: repository version width is seven characters

`next.config.js` at the authorized candidate intentionally computes build identity as:

`WORKERS_CI_COMMIT_SHA || CF_PAGES_COMMIT_SHA`, then `.slice(0, 7)`, otherwise `dev`.

Therefore the truthful expected `/api/version` SHA for the authorized candidate is:

`6da1c24`

NOT `6da1c246`.

Do not change `next.config.js` for this task.

Because this deploy is executed locally rather than by Cloudflare Workers Builds, the CI provenance variables are absent by default. It is explicitly authorized to supply the exact checked-out Git identity to the build process as build metadata:

- `WORKERS_CI_COMMIT_SHA=$(git rev-parse HEAD)`
- `WORKERS_CI_BRANCH=perf/perf4-staging-timing-integration`

This is not permission to invent or override an arbitrary SHA. Derive the value from the detached exact candidate checkout immediately before build/deploy and assert it equals the full authorized candidate.

## Gate A: Cloudflare authentication before any deploy

From `/home/ary/Developer/bloomops`, first run a read-only authentication check such as:

`npx wrangler whoami`

Never print or retrieve the raw authentication token. Do NOT run `wrangler auth token`.

If already authenticated to the correct Cloudflare account, continue.

If not authenticated, use Wrangler's device authorization flow:

`npx wrangler login --device --browser=false`

This may print the Cloudflare verification URL and a short one-time device code. It is acceptable to show those temporary authorization instructions to the user. Do not place them in Git, evidence, logs, or documentation.

Do not proceed until device authorization completes successfully and `npx wrangler whoami` succeeds.

If authentication cannot be established, STOP. Do not deploy and do not add another blocker commit to the application/evidence branch unless there is genuinely new durable evidence worth preserving.

## Gate B: signed-in browser availability before any deploy

The first attempt had no Chrome DevTools MCP tools and no usable loopback debug endpoint. Do not deploy until browser readiness is established.

1. Check whether the current Codex session exposes the previously configured `chrome-devtools` MCP tools.
2. If not, inspect the current Codex MCP configuration/read-only status (`codex mcp list` and the relevant `~/.codex/config.toml` section if needed) without exposing unrelated secrets.
3. If `chrome-devtools` is simply missing, it is acceptable to configure the standard Chrome DevTools MCP server for Codex using the official setup, but do not change repository files to do so.
4. If adding/reconfiguring MCP requires restarting Codex, STOP BEFORE DEPLOY and tell the user exactly that the session must be restarted and this same resume prompt rerun.
5. Once tools are available, verify that the browser profile/session can open the staging URL and is ALREADY authenticated. The persistent Chrome DevTools MCP profile may be reused if it already contains the prior staging session.
6. Do NOT trigger a magic-link request, do NOT send a real sign-in email, do NOT copy/export cookies or bearer credentials, and do NOT substitute a new unsafely authenticated session.

If no existing signed-in staging session is available, STOP BEFORE DEPLOY and report that single blocker.

## Exact candidate checkout for deployment

Only after BOTH Gate A and Gate B are green:

1. `git fetch origin`
2. Confirm the main working tree is clean.
3. Confirm commit `6da1c2467ae0a4ae31bcefcd1ca16482c7f5bae5` exists locally and on GitHub.
4. Confirm current evidence branch ancestry still contains that commit and that later commits are documentation/evidence only unless separately reviewed.
5. Create a temporary detached worktree at the exact candidate, for example under `/tmp`, rather than checking out the evidence-only branch head as the deployed source.
6. In the detached candidate worktree, assert:

`git rev-parse HEAD`

is exactly:

`6da1c2467ae0a4ae31bcefcd1ca16482c7f5bae5`

7. Install from the lockfile as needed without changing tracked files.

Do not cherry-pick the blocked-attempt documentation into the deployment worktree.

## Corrected staging deployment command

From the detached exact candidate worktree, derive and verify:

`CANDIDATE_SHA=$(git rev-parse HEAD)`

Require it equals the exact authorized candidate above.

Then run the repository's staging deploy with truthful build identity supplied only to this process:

`WORKERS_CI_COMMIT_SHA="$CANDIDATE_SHA" WORKERS_CI_BRANCH="perf/perf4-staging-timing-integration" npm run deploy:staging`

STAGING ONLY.

No production deploy.
No migration.
No schema command.
No PR or merge.
No optimization.
No D2.
No Worker Logs, invocation logs, traces, or tailing.

Record only non-secret deployment provenance.

## Corrected `/api/version` acceptance gate

After a successful upload, request:

`https://bloomops-staging.cool-sunset-2169.workers.dev/api/version`

Require:

- HTTP 200
- `sha` exactly `6da1c24`
- `branch` exactly `perf/perf4-staging-timing-integration`

The seven-character SHA is accepted because it is the repository's existing intentional `slice(0, 7)` representation and the build input was derived from the exact detached checkout.

If the response is `dev`, `2b89227`, another SHA, another branch, or provenance is otherwise ambiguous, STOP measurements immediately.

Do not change version metadata after deployment to force a pass.

## Continue the original correlation plan

Once the corrected provenance gate passes, execute the original `PERF4_STAGING_CORRELATION.md` measurement and evidence requirements starting with the signed-in browser capture:

- same existing signed-in staging browser session
- seven allowlisted routes
- one discarded warmup per route
- exactly three retained warm navigations per route
- 21 retained samples total
- browser TTFB / root RSC EOF / visibility / settled metrics where available
- `X-Bloomops-Timing` and initial `Server-Timing`
- Analytics Engine correlation against `bloomops_perf4_staging_timing`
- ideal fully delivered normal result: 21 unique IDs / 63 records, but report actual best-effort delivery, sampling, missing or duplicates
- fixed-schema privacy acceptance
- Home and Systems phase analysis plus Ads control
- compare against historical PERF3 using compatible definitions only
- no optimization even if the bottleneck becomes obvious

All original privacy restrictions remain mandatory.

## Evidence after a successful/partially successful deployed run

The detached deployment worktree is source-only. Put resulting sanitized documentation/evidence changes on the existing evidence branch `perf/perf4-staging-timing-integration`, starting from its then-current remote head, not by modifying the deployed candidate SHA.

Keep these identities separate in the final handoff:

- deployed application SHA: `6da1c2467ae0a4ae31bcefcd1ca16482c7f5bae5`
- deployed `/api/version` short SHA: `6da1c24`
- final evidence/handoff branch SHA: whatever new documentation/evidence commit is created

Push only the evidence/handoff branch update. Do not open a PR.

## Final response

Return either:

### If blocked before deployment
- which gate failed: Cloudflare auth or signed-in browser
- exact minimal user action required
- confirmation that no deployment occurred
- no additional speculative work

### If deployed/captured
- exact deployed full SHA
- `/api/version` result
- Cloudflare deployment provenance without secrets
- browser retained samples / 21
- Analytics Engine expected/retrieved/missing/duplicate/sampled counts
- seven-route median table
- Home timing breakdown
- Systems timing breakdown
- Ads control breakdown
- dominant deployed phase(s)
- privacy verdict
- remote auth/revocation verdict
- final evidence branch SHA
- remaining unknowns
- whether the evidence is sufficient to choose the smallest next optimization

Stop there.

Do not open a PR.
Do not merge.
Do not implement the optimization.
PERF3/PERF4 remain OPEN pending review.
D2 remains BLOCKED.
