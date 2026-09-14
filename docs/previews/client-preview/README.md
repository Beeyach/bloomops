# Read-only client preview (N2B)

Implementation branch: `feat/n2-client-preview`, based on merged main `a339085`.
One Sol High read-only review found no material findings. Staging acceptance is tracked in [BUILD_STATE](../../BUILD_STATE.md).

From a readable client, **Preview as client** opens the connected-contact picker. The preview retains the staff session, names the selected business/contact and uses current portal authority. Home, Content, approval snapshots, Pages/subpages/discussions and ready-file downloads are read only. Staff client access and contact membership/link are checked together; another client linked to the same account stays outside this preview. Page grants retain nearest-deny/inheritance behavior. Copied/refreshed preview actors cannot edit Pages, comment, submit onboarding or respond to approvals.

| Desktop | Phone |
| --- | --- |
| [Home](home-1440.png) | [Home](home-390.png) |
| [Page reader](page-desktop.png) | [Nested Page](page-phone.png) |

These captures use fictional local records. The deliberate private-file and unsafe-action links in the Page fixture test denial; they are not real client records. The former remains behind the preview download check; the unsafe destination is inert. A denied image cannot load private bytes.

## Verification

- 219 focused Node checks pass across preview authority, copied actors, live revocation, Pages and inheritance, onboarding, portal content, project paging, sanitizer and relevant rendering regressions.
- Actual production OpenNext build passes. 41 browser checks pass. Results are recorded in [browser-results.json](browser-results.json), covering five widths, actual file reads, content/approval/Page navigation, session preservation, rejected writes, unassigned/client callers, removed contact/staff grants and clearing an open preview after revocation.
- [Query metrics](query-metrics.json): the periodic preview check uses one bounded domain query, even with250 additional contacts. This excludes the normal request authentication queries. Preview work selects ten projects plus one lookahead; milestone reads use only those ten parents. Existing client161kB, Prospecting123kB, Pages118kB and Work108kB first-load estimates remain unchanged; the new preview is117kB. These are local query/build measurements, not remote latency claims.
- Real Worker QA caught D1's expression-depth limit in nested portal Content/file SQL. The unreachable internal Ads branch is omitted for Client actors; the same portal predicates and DTOs remain. Content list/detail subsequently passed on workerd. Visual review caught a missing Page stylesheet; preview now imports the existing reader styles and verifies compact glyphs at every required width.
- Browser harness initially assumed an uppercase fixture name, used network-idle for streaming pages and expected HTTP404 after a loading boundary had already streamed HTML200. It now waits for actual destination content and verifies the rendered unavailable state with no private content. API denials remain404; unsupported verbs return405.

Run from this isolated worktree with the local fixture described in the scripts:

```sh
node --test tests/bloomops-client-preview.test.mjs tests/bloomops-preview-links.test.mjs
npm run cf:build
npx --no-install wrangler dev --local --port 8810 --inspector-port 9310
TMPDIR="$PWD/.task-tmp" LD_LIBRARY_PATH=/tmp/bloomops-pilot-tools/libs/usr/lib/x86_64-linux-gnu BLOOMOPS_BROWSER_BASE=http://localhost:8810 BLOOMOPS_BROWSER_EVIDENCE_DIR=/home/ary/Developer/bloomops-n2-preview-evidence node scripts/client-preview-browser-local.mjs
```

## Boundaries

No migration, new dependency, session impersonation, invitation, real email, approval, payment, signature or production/DNS changes. A contact needs an existing durable link and active Client membership; preview never invents access. Server authority is fresh on every destination/download and after storage awaits. An open screen checks on focus/pageshow and every ten seconds while visible; this is not a push-based revocation channel. Failed checks clear the preview.

External authored actions/links remain inert. Inline raster and recognized Bloomsi file images use the safe reader path; other authored image URLs are omitted. Preview does not mount internal Page work embeds or an editor. Video/recording controls and video tests remain paused. N2 photos/discussion/notifications, N3 reporting, N4 reusable work and the wider save/recovery inventory remain separate unfinished work.

## Staging acceptance

[Workflow34907194523](https://github.com/Bloomwired/bloomops/actions/runs/34907194523) passed on runtime00f540b. [Eight live checks](staging-checks.json) pass without record writes. [Desktop](staging-desktop.jpg) and [phone](staging-phone.jpg) captures show the existing fictional QA client's empty picker; it has no connected Client account. Populated portal/permission coverage remains the isolated local evidence above. [Open the QA staging entry](https://staging.ops.gobloomwired.com/clients/097f94a802a8426cb017aa94fcc72d20/preview) with the existing QA workspace selected. [PR75](https://github.com/Bloomwired/bloomops/pull/75) remains draft/unmerged.
