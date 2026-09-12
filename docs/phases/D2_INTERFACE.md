# D2 GHL build interface and HTTP boundary

Base: verified merge `8df6d318ae1889691fe73a7fd19e155c4f6f5d69`; both exact-SHA gates passed before implementation.
Continue under the owner's standing instruction until actual input is required.

## Scope

Expose the reviewed preparation/generation backend through three protected
Project endpoints: GET blueprint options, POST blueprint preview and POST
blueprint generation. Use existing Project management/resource authorization,
identity, origin checks, strict input, sanitized errors and no-store responses.
No new authority comes from the UI. Denied/missing/foreign Projects keep the
existing indistinguishable responses. No schema, migration, provider execution,
general template editor or automatic Service Type binding.

On an eligible empty planned Project, show Start GHL build. Offer explicit
component selection (initially none), then a server-generated preview of the
selected Milestones, Actions, Deliverables and dependency relationships. Explain
that work starts internal, without assignments or dates, and keeps the Project
planned. Confirmation invokes the reviewed atomic writer; success refreshes the
canonical Project and its existing activity. Client/Team users get no controls.
Ineligible ordinary Projects get no irrelevant GHL prompt.

Preserve the exact request UUID, selection and preview preconditions for retries.
After any uncertain response, offer Retry this request, with no new request ID or
changed selection. Keep a bounded tab-local retry packet scoped to current
workspace/membership/Project, so reloading after a committed/lost response can
resume even when the Project is no longer empty. No raw definition, plan, labels
or credential is stored in browser persistence. The server validates everything
again. Remove a packet after proven success, or after a completed domain
rejection and a fresh eligible empty-Project read allow an explicit new preview.
Network/500/integrity failures retain the exact packet. Never auto-submit on mounting.
Storage-unavailable handling must not silently lose an uncertain request.

Use existing Bloom dialog, fields, buttons and notice primitives. Verify
keyboard/focus/escape, loading, selected/disabled/error/recovery states,
reduced motion and 1440/1024/768/390/320px widths in the actual local Worker.
Reuse the existing external Playwright, Chromium libraries and local captured
mail. Do not send real mail. Keep synthetic fixtures in this isolated worktree.

## Acceptance

Actual route tests exercise anonymous/cross-origin/Client/Team/foreign/revoked
access, exact input allowlists, selection/preview read-only behavior, stale
preconditions, safe error serialization, one commit and exact retry. Retain
backend invariant coverage. Browser checks cover select/preview/back/confirm,
canonical work and activity, duplicate/lost-response recovery (including reload),
no generation for ineligible/unauthorized Projects and portal invisibility.

Run affected/full tests, Cloudflare build, browser checks, one fresh Sol High
read-only review (at most one focused re-review), then publish and verify both
exact-merge-SHA workflows and staging identity. D2 remains open until the actual
setup/owner-selected Service Type binding and integrated acceptance are complete.

## D2 interface local acceptance (2026-09-11)

- Protected Project blueprint options, preview and generation endpoints reuse current Project management authority and the reviewed domain writer. The Project flow provides explicit selection, server preview, confirmation and bounded tab-local recovery of the same request after a lost response/reload. No automatic submission or live binding, schema/migration, provider execution or general template editor.
- Verification: 14 new HTTP tests, 95 affected tests and 5,850 full-suite tests pass; current Cloudflare/OpenNext build passes. The stable built local Worker passes 42 browser/HTTP checks with 16 screenshots at 1440/1024/768/390/320px, covering controls, keyboard/dialog, reduced motion, all-component generation, exact lost-response/reload retry, stale preview recovery, storage refusal, Team denial and actual Client portal/API exclusion. No page errors. Live design reference inspected successfully. Logs and screenshots: `/tmp/bloomops-d2-interface/`.
- Local environment correction: a shared `node_modules` symlink produced a built artifact with unsupported dynamic requires. Installing the unchanged lockfile into this worktree and rebuilding resolved local packaging. No dependency/configuration changes. Browser work corrected 16px label sizing and isolated native checkbox appearance; the harness now waits for animations and uses the existing assignment API's HTTP 200. Final browser checks ran on a restarted complete artifact, after an earlier rebuild interrupted Client navigation. No real mail was sent; fixtures and captured mail remain in isolated local D1/R2.
- One fresh Sol High read-only review found no material correctness, authorization, isolation, retry, privacy or regression findings; no re-review was needed. Publication and both exact-merge-SHA gates are pending. Work is on `feat/d2-generation-interface` from verified `8df6d318ae1889691fe73a7fd19e155c4f6f5d69`; original branches and unrelated guide/configuration work remain preserved. Next: publish and verify the reviewed interface, then address explicit GHL setup/binding and remaining integrated D2 acceptance.

## D2 generation interface closure (2026-09-12)

- [PR #45](https://github.com/Bloomwired/bloomops/pull/45) merged reviewed `e221aecd295ba41b3e720704100c434109523629` as `c5d6b2edd4cd843f3e96c054e495f00bfbecbfb5`; merge and reviewed trees match exactly. No migration or live binding was performed.
- [Deploy staging 34679662184](https://github.com/Bloomwired/bloomops/actions/runs/34679662184), job `103515797952`, and [Verify zero-to-current 34679662243](https://github.com/Bloomwired/bloomops/actions/runs/34679662243), job `103515798082`, passed on the exact merge SHA, with every required step successful. Live staging reports `c5d6b2e`; all eight original database IDs/names are restored and the disposable database is absent.
- Evidence: `/tmp/bloomops-d2-interface/` run/job metadata, archived CI logs, staging identity and inventories. The first inventory read from the new worktree received a Cloudflare authentication error; the established CLI checkout successfully supplied both before/after read-only inventories. As in prior runs, archived verifier stdout truncates during verbose migration output; complete run/job/step metadata and direct cleanup establish the gate, without claiming a full remote integrity/no-op log tail.
- Local acceptance remains 95 affected / 5,850 full-suite tests, 42 actual local Worker browser/HTTP checks with 16 screenshots, and the accepted Cloudflare build. One fresh Sol High review found no material issues. No runtime change followed review; final syntax, diff and current-phase links passed. Original checkout/branches and unrelated guide/configuration work remain preserved.
- Next: explicit GHL setup under [D2_SETUP_INTERFACE.md](D2_SETUP_INTERFACE.md), then integrated D2 acceptance. The UI now supports existing explicit bindings; staging's GHL and Kajabi Service Types remain unbound.
