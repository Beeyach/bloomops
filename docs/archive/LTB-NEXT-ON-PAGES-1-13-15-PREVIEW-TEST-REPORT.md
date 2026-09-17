# next-on-pages 1.13.15 preview test

Repo: `Beeyach/bloomtrack-pro`. Production: `https://leadsthatbloom.com`, unchanged on `c85812e7` / commit `0f9bd20`.

**Result: FAIL, and it failed earlier than expected.** 1.13.15 never produced an artifact. Two preview builds were attempted and both died during the build, so there was never a deployment to point a browser at. The authenticated 5-of-5 test could not be run because there was nothing to run it against.

**Production was never touched.** No production deployment was created. Nothing was promoted. Nothing was merged.

---

## Verdict

`NEXT-ON-PAGES 1.13.15 DID NOT CLEAR THE AUTHENTICATED 500 — STOP VERSION LOTTERY. THE NEXT DECISION IS BETWEEN A CONTROLLED NEXT 15.x COMPATIBILITY TEST AND PLANNING THE OPENNEXT MIGRATION.`

Said precisely, because the required wording is stronger than what was observed: **1.13.15 did not clear the 500 because 1.13.15 cannot be built against this project at all.** It is not that the adapter produced a bundle that still crashed. It never produced a bundle. The conclusion for what to do next is the same either way, and the reason to stop is now firmer than "it did not work": this version is not installable here without materially changing the dependency tree, which is precisely the kind of change that would invalidate the experiment.

**Production promotion: not recommended, and not possible.** There is no passing artifact to promote.

---

## 1. Branch and base

| | |
|---|---|
| Base | `0f9bd20` (current production source) |
| Branch | `fix/cloudflare-next-on-pages-1-13-15` |
| Commits | `67664ab` then `dfcaa7b` |
| Merged to main? | **No.** Pushed only. `main` is still `0f9bd20` with no changes. |

State recorded before editing:

```
git rev-parse HEAD    0f9bd2066d5773f332cd72db9f6d3c98a80fe20d
git status --short    three untracked report .md files, nothing else
package.json          "@cloudflare/next-on-pages": "^1.13.16"  (in dependencies, not devDependencies)
                      "pages:build": "npx @cloudflare/next-on-pages"
package-lock.json     adapter 1.13.16, next 15.4.11, wrangler 4.110.0
Pages build command   npx @cloudflare/next-on-pages@1
Resolved in prod log  @cloudflare/next-on-pages v1.13.16, Next.js 15.4.11
```

## 2. The exact diff

**Zero app source. Zero dependency change. Zero lockfile change.** The whole branch is the `pages:build` script:

```diff
-    "pages:build": "npx @cloudflare/next-on-pages"
+    "pages:build": "npx @cloudflare/next-on-pages@1.13.15"
```

then, on the second attempt:

```diff
-    "pages:build": "npx @cloudflare/next-on-pages@1.13.15"
+    "pages:build": "npm_config_legacy_peer_deps=true npx --yes @cloudflare/next-on-pages@1.13.15"
```

### Why the pin is not in `dependencies`

The brief asked for the dependency itself to be pinned. I tried that first and backed it out, because it cannot be done without dragging the tree with it:

- `npm install` with `"@cloudflare/next-on-pages": "1.13.15"` → **ERESOLVE**. 1.13.15 declares `@cloudflare/workers-types@^4.20240208.0`; `wrangler@4.110.0` declares `^5.20260708.1`.
- Pinning wrangler to the version already installed did not help. The conflict is wrangler's own declaration, not an opportunistic upgrade.
- `npm install --legacy-peer-deps` succeeded but **removed 233 packages** and cut 3,527 lines from the lockfile.

That last one is disqualifying. Removing 233 packages changes what `next build` compiles, so a pass or fail afterwards would say nothing about the adapter. Leaving the tree untouched and letting `npx` fetch the pinned adapter keeps exactly one variable in play: which adapter binary runs.

### A note on the two versions' manifests

Both versions declare the identical peer, and identical metadata:

```
1.13.15  peerDependencies      { vercel: ">=30.0.0", wrangler: "^3.28.2 || ^4.0.0",
                                 @cloudflare/workers-types: "^4.20240208.0" }
1.13.16  peerDependencies      { next: ">=14.3.0 && <=15.5.2", vercel: ">=30.0.0 && <=47.0.4",
                                 wrangler: "^3.28.2 || ^4.0.0",
                                 @cloudflare/workers-types: "^4.20240208.0" }

both     peerDependenciesMeta  { @cloudflare/workers-types: { optional: true } }
```

Yet `npm install --dry-run` succeeds at `^1.13.16` and fails at `1.13.15`. Since the declarations are the same, the difference is in npm's resolution path rather than in any stated incompatibility. I am recording that as an observation and not inventing a mechanism for it.

## 3. Local build: not possible on this machine

`npx @cloudflare/next-on-pages@1.13.16` fails on Windows before doing any work:

```
Error: spawn npx ENOENT
  syscall: 'spawn npx',
  spawnargs: [ 'vercel', 'build' ]
```

The adapter shells out to `npx vercel build` in a way Windows cannot satisfy. This is the limitation already written into `package.json`: *"pages:build only works on Linux/macOS/WSL (it requires bash)."* WSL is not installed on this machine. So no baseline and no comparison build could be produced locally, and Cloudflare's own Linux builder had to be the test bed. That is arguably better, since it is the environment that produces the real artifact.

## 4. Preview deployments

Three previews were created. **No production deployment was created.**

| Deployment | Commit | Adapter | Outcome |
|---|---|---|---|
| `a07d4a73-bea3-4062-8f9d-4614e2fa1a9a` | `67664ab` | **1.13.16** | **deploy success** — the control |
| `4fb1b11e-c22c-419f-a8b0-4d0f0b5ccd44` | `67664ab` | 1.13.15 attempted | **build failure** |
| `b9df62f5-f741-4419-9d1d-2f21da67d432` | `dfcaa7b` | 1.13.15 attempted | **build failure** |

### The control, `a07d4a73`

Built before the build command was switched, so it used the project setting `npx @cloudflare/next-on-pages@1`:

```
Executing user command: npx @cloudflare/next-on-pages@1
⚡️ @cloudflare/next-on-pages CLI v.1.13.16
▲  Detected Next.js version: 15.4.11
```

URL `https://a07d4a73.bloomtrack-pro.pages.dev`, also aliased to `https://fix-cloudflare-next-on-pages.bloomtrack-pro.pages.dev`. Unauthenticated behaviour matches production exactly:

```
307  /       -> /gate
200  /gate   len 9162
```

This confirms the branch's one-line change does not disturb the app, and that a preview of this source deploys normally. It is a 1.13.16 build, so it is the same artifact as production and needed no further testing.

### Build-command handling, and why production was safe

`build_config` on a Pages project is **shared between production and preview**. There is no per-environment build command. To let the branch choose its own adapter version, the command was temporarily changed:

```
npx @cloudflare/next-on-pages@1     ->   npm run pages:build     (temporary)
npm run pages:build                 ->   npx @cloudflare/next-on-pages@1   (restored)
```

Production could not have been affected during that window. `main`'s `pages:build` script carries no version, so `npx` would have used the locally installed 1.13.16 from the untouched lockfile, which is exactly what production builds today. No production build was triggered in any case. The setting has been **restored and verified**:

```
build_command now    "npx @cloudflare/next-on-pages@1"
canonical deployment c85812e7-9048-49ac-81e8-2dd226ad044c
production commit    0f9bd20
```

## 5. Cloudflare build logs, both failures

### Attempt 1, `4fb1b11e` — could not install

```
npm warn exec The following package was not found and will be installed: @cloudflare/next-on-pages@1.13.15
npm error code ERESOLVE
npm error Found: @cloudflare/workers-types@4.20260702.1
npm error   peerOptional @cloudflare/workers-types@"^4.20240208.0" from @cloudflare/next-on-pages@1.13.15
npm error Could not resolve dependency:
npm error   peerOptional @cloudflare/workers-types@"^5.20260811.1" from wrangler@4.123.0
Failed: build command exited with code: 1
```

The same ERESOLVE seen locally, reproduced on Cloudflare's builder. The adapter never ran.

### Attempt 2, `dfcaa7b` / `b9df62f5` — installed, then broke the app build

`workers-types` is TypeScript definitions and `wrangler` is a local CLI that takes no part in the build, so the conflict is packaging rather than a real incompatibility. Scoping `npm_config_legacy_peer_deps=true` to the `npx` install cleared the ERESOLVE. The build then got further and failed differently:

```
Module not found: Can't resolve '@tiptap/extension-drag-handle-react'
  ./components/RichEditor.jsx
  ./components/ClientsView.jsx
  ./components/ProspectsApp.jsx
> Build failed because of webpack errors
Error: Command "npm run build" exited with 1
⚡️ The Vercel build (`npx vercel build`) command failed.
```

`@tiptap/extension-drag-handle-react` is a direct dependency in `package.json` and installs correctly on every other build. The legacy-peer-deps override pruned it out of the tree, which is the same collateral damage measured locally, where the same flag removed 233 packages.

So attempt 2 does not tell us anything about 1.13.15 either. It tells us the workaround needed to install 1.13.15 destroys the dependency tree it was supposed to leave alone.

**No third attempt was made.** Continuing would mean either forcing dependency surgery to satisfy a deprecated adapter, or walking down 1.13.14, .13, .12 in turn. Both are the version lottery the brief said to avoid.

## 6. Authenticated 200/500 results

**Not obtainable for 1.13.15.** No deployment existed to test. Recorded for completeness:

| Target | Adapter | Authenticated `/` |
|---|---|---|
| Production `c85812e7` | 1.13.16 | **500**, 3 of 3, `__next_error__`, unchanged |
| Control preview `a07d4a73` | 1.13.16 | not tested; same artifact as production, and the preview host cannot receive the production session cookie |
| 1.13.15 preview | — | **no deployment exists** |

On the preview host: an authenticated test there would need a fresh sign-in on `*.bloomtrack-pro.pages.dev`, because the session cookie is scoped to `leadsthatbloom.com`. That requires your access code, which I will not handle. It did not become necessary, because there was no 1.13.15 artifact to test. Worth noting that the preview environment **is** correctly configured for it now: the D1 `DB` binding plus `LTB_ACCESS_CODES` and `LTB_SESSION_SECRET` are all bound to preview, so if a future candidate build does deploy, the authenticated test is one sign-in away.

## 7. Smoke test and artifact comparison

No 1.13.15 artifact was produced, so there was nothing to smoke test and no hashes to compare against production. Production's own artifact is unchanged from the previous report:

```
webpack-92231630c6205877.js
89d2e1512c474a8f.css, 961b289d606e3871.css
```

Production remains healthy on every surface other than the known one:

```
307  /           -> /gate      (signed out, correct)
200  /gate       len 9162
200  /api/auth   len 23
500  /           (authenticated, the known regression, unchanged)
```

## 8. Package 23 and outbound safety

Read after all builds. `SELECT` only.

| Check | Value |
|---|---|
| Package 23 status | `APPROVED` |
| `sequence_approved` | `1` |
| `auto_followup_approved` / `_at` | **`0`** / `null` |
| Package 23 `updated_at` | `2026-08-14T05:22:42Z`, untouched |
| Prospect 3163 `emails_sent` | **`0`** |
| `send_events` total / newest | **10** / `2026-08-12T16:35:41Z` |
| New `send_events` | **0** |
| Packages armed for auto-followup | **0** |
| Packages updated | **0** |
| Jobs created | **none, of any kind** |
| Send-shaped jobs | **0** |
| `autoSendApprovedFirstEmails` | **`false`**, last written 2026-08-11 |
| `autoSendApprovedFollowups` | **`false`**, last written 2026-08-11 |

**Outbound safety delta: zero.** A preview deployment shares the D1 database, so this was worth confirming rather than assuming, and nothing moved.

## 9. What is left

The cheap lever is now spent. What remains, in the order I would take them:

**A. A controlled Next 15.x test.** The lockfile pins Next 15.4.11; 15.x is currently at 15.5.23. Note that 1.13.16 declares a `next` peer of `>=14.3.0 && <=15.5.2`, so **15.5.2 is the ceiling the adapter will accept**, not 15.5.23. That makes the test a narrow one with a defined target, and a different Next version emits different chunk boundaries, which is the mechanism that could move the build off the defect. Same method as this task: branch, preview, no production until it passes.

**B. Plan the OpenNext migration.** `@opennextjs/cloudflare`, currently 1.20.2. The adapter you are on is deprecated, is frozen at 1.13.16, and this task demonstrated that its neighbouring version is not even installable against a current wrangler. You will end up here regardless. Better as planned work than as a hotfix.

**Still reasonable: leave it parked.** The app works. The cost is a slower cold first paint and 500s in the log. It touches nothing about sending, data or automation.

## Zero-change proof

```
main                  0f9bd20, unchanged, not merged into, no commits added
Branch                fix/cloudflare-next-on-pages-1-13-15, pushed, unmerged
App source changed    none
Dependencies changed  none on main; none on the branch either (script line only)
Lockfile changed      none, on either branch
Pages build command   temporarily changed, restored and verified
Production deploys    none created; still c85812e7 / 0f9bd20, holding the domain alias
Preview deploys       3 (1 control success, 2 build failures); previews never affect production
D1 statements         SELECT only
Out of scope          package 23, email, approvals, AUTO_SEND_* switches, migrations,
                      scheduler, Gmail logic, Gmail hand-off, and all UI were untouched
```

---

## Final statement

`NEXT-ON-PAGES 1.13.15 DID NOT CLEAR THE AUTHENTICATED 500 — STOP VERSION LOTTERY. THE NEXT DECISION IS BETWEEN A CONTROLLED NEXT 15.x COMPATIBILITY TEST AND PLANNING THE OPENNEXT MIGRATION.`

To be exact about what was learned: 1.13.15 could not be installed against this project's dependency tree on Cloudflare's builder or locally, and the override that makes it installable prunes the tree badly enough that the app itself stops compiling. No artifact, no test, no promotion. Production is unchanged on `c85812e7` / `0f9bd20`, still healthy apart from the known authenticated 500, and no outbound safety state moved.
