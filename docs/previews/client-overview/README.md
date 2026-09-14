# N2A client overview

The Overview tab now puts purchased services, current projects/tasks, the next deadline and open onboarding requests before client administration. Engagement, work and onboarding states stay separate. Items link to canonical work pages and client tabs; milestone/deliverable deadlines have real record anchors. Existing editing, health, contact, activation and tab flows remain.

The internal server composition refreshes authority, preserves the client route gate and applies live record predicates before date ordering and limits. Service/project/action-only assignments do not grant access to the internal client record. Restricted child work stays restricted. Each visible list has at most five items and a truthful more-results indicator. Upcoming dates include today in the client's timezone. Past-due work is separate, and unmet task prerequisites suppress false overdue labels. No summary table, cache, write endpoint, migration or new dependency.

## Local verification

- Final OpenNext build passes. 75 focused Node checks pass (19 overview domain, two overview render and 54 existing project/milestone/deliverable regressions).
- [24 built-Worker browser checks](browser-results.json) pass on isolated development D1/R2 at localhost8809. Synthetic fixtures only; local R2 mail, with external browser requests blocked. Tests follow task and milestone links, save/reload real client and contact edits, exercise Team Member assignment/revocation and unavailable foreign/missing clients, keep Client accounts on the portal, and verify empty/streaming states, keyboard focus and five screen widths.
- Domain tests cover all internal roles, client/service/project/task scopes, revoked membership/assignments, terminal and blocked work, timezones, all four deadline types, more than200 projects, stable ties, submitted/unverified requests, required progress, bounded lists, failed reads and no writes.
- [Query measurements](query-metrics.json): the new summary performs18 actual SELECT executions and returns567 bytes for the small synthetic case, unchanged with250 added historical projects. These are local SQLite/D1-adapter measurements, not Cloudflare latency. The old overview loaded200 projects only to determine whether its tab existed (111,114 bytes here); the new one-row probe returns578 bytes. Populated lists remain bounded to five plus one lookahead. Canonical onboarding progress still reads its single selected instance's visible items; no per-project or per-item query loop is added.
- Against the reviewed runtime tree merged as6ab4d11, rounded first-load estimates stay Home103kB, client detail161kB, Pages118kB, Prospecting123kB and Work108kB. Client detail's own route estimate changes6.54→6.86kB. No unrelated shell query code changed.

[Desktop1440](overview-1440.png), [tablet1024](overview-1024.png), [tablet768](overview-768.png), [phone390](overview-390.png), [phone320](overview-320.png) and [empty overview](overview-empty.png). Full-page phone captures show the existing fixed bottom navigation at its viewport position. Narrow tablets use a single work column to keep dates and request headings readable.

The external Bloomlab design gallery returned its application error screen, despite HTTP200. The committed design guide and current Bloomsi primitives/official logo were used. Browser setup reused existing extracted libraries and task-local temporary storage because system /tmp was full. Harness corrections used the actual contact Save label and page readback (the client detail API exposes PATCH, not GET), and waited for reload after existing router refresh. These were test assumptions, not app save failures. No video tests, real mail, paid APIs, imports/outreach, production/DNS or original LTB changes.

The initial Sol High review found that All projects lost client scope at the Work route. It now opens the canonical client Projects tab; the single focused re-review passed with no material findings. Staging acceptance passed; BUILD_STATE records the release gate. The final build and browser run include the narrow-tablet spacing refinement and a second-client regression for the Projects destination.


## Reproduce locally

Use a fresh isolated worktree with Node22+, locked dependencies and an ignored local-only `.dev.vars`. Run the repository's local schema/inherited/domain migration commands in order, then:

```bash
node scripts/client-overview-fixture-local.mjs /tmp/n2-fixture.sql
npx --no-install wrangler d1 execute DB --local --file=/tmp/n2-fixture.sql
npm run cf:build
npx --no-install wrangler dev --local --port 8809 --inspector-port 9309
```

In another terminal, set `BLOOMOPS_BROWSER_BASE=http://localhost:8809`, `BLOOMOPS_BROWSER_EVIDENCE_DIR` to a task-local directory and `BLOOMOPS_PLAYWRIGHT_PACKAGE` to the existing Playwright package.json, then run `node scripts/client-overview-browser-local.mjs`. This environment used `/tmp/bloomops-pilot-tools/package.json` and its extracted libraries via `LD_LIBRARY_PATH=/tmp/bloomops-pilot-tools/libs/usr/lib/x86_64-linux-gnu`; `TMPDIR` pointed to a task-local directory. The fixture script emits SQL from synthetic migrated SQLite records and assumes its fixed IDs are absent. The browser harness makes only local QA edits and captures local R2 sign-in mail; it rejects deployed origins. Keep its storage-state.json out of Git.


## Staging acceptance

[Workflow34903134066](https://github.com/Bloomwired/bloomops/actions/runs/34903134066) succeeded on `e0ed7a16e973cb1d5d33daa0ec2f7334c5286fa9`. Public version and health confirm that runtime on staging with45 migrations. [Live checks](staging-checks.json) cover the four overview sections, desktop1440/phone390 without overflow, 44px phone summary links, existing edit/contact/activation controls, honest empty states and Services/Onboarding/client-scoped Tasks destinations. Missing clients remain404. The task tab was restored to desktop.

[Deployed desktop](staging-desktop.jpg) and [deployed phone](staging-phone.jpg) were visually inspected. The existing QA workspace had no clients. One fictional draft client `QA Bloomsi Client Overview` and its required primary contact were created through the existing API, with an example.invalid address. No activation, invitation or real communication occurred. Its [staging preview](https://staging.ops.gobloomwired.com/clients/097f94a802a8426cb017aa94fcc72d20) requires the existing QA workspace. Live acceptance covers the empty state; the populated preview and mutation/permission matrix are the isolated local evidence above. Local Worker8809 is stopped. PR74 remains draft/unmerged; no new migrations or production/DNS changes.
