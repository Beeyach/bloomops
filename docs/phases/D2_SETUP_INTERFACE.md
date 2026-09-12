# D2 explicit GHL setup interface

Base: verified merge `c5d6b2edd4cd843f3e96c054e495f00bfbecbfb5`; both exact-SHA gates passed before implementation. Continue under
standing owner authorization until a real product/access decision is needed.

Expose the reviewed default provisioning and explicit binding functions through
a narrow internal Settings flow for current templates.manage capability holders.
Owner/Admin inherit it; PM/Team require an explicit live grant; Client never.
The read model lists active Service Types in the canonical active Systems
Department, scoped by fresh workspace/membership/role/identity/capability SQL.
No provider/platform inference from names or slugs confers eligibility/authority.

The user explicitly selects one Service Type, reviews whether GHL builds will be
enabled or disabled for it, and saves with the exact current binding ID/revision
(or null). No default selection, catalogue bootstrap binding or automatic live
setup. Preserve existing non-GHL bindings; this narrow flow cannot replace them.
Enabling requires a GHL default that satisfies the reviewed canonical version-one provisioning
contract; customized/inactive/retired/extra-version history is a conflict, never
repaired. Disabling an existing default-GHL binding does not need a valid or
active published version and must not provision anything. Disabling a currently
unbound Service Type is an authorized read no-op. The same save may provision the default before setting its binding;
these are separate idempotent facts, so a stale binding refusal may leave a valid
unused default installed, but never falsely report enabled generation. Validate
Service Type/current binding before provisioning. Never expose raw definitions.

No generalized template editor, version editing, schema/migration, credentials,
provider execution, D3 or broad Settings redesign. Configuration affects only
future generation; existing Projects and receipts remain unchanged. Disabling a
binding must not prevent exact replay of a previous authorized generation.

Reuse existing protected HTTP boundaries, strict input, same-origin protection,
no-store and safe errors; the existing live domain authorization remains final.
Test capability revocation, role/tenant/Client denial, service eligibility,
canonical default conflicts, stale/concurrent saves, no-op/disable semantics,
no replacement of other bindings and generation/replay after configuration
changes. Browser acceptance covers explicit selection, enable/disable, errors,
keyboard/mobile/reduced motion, inherited/explicit/denied capability and a full
setup → empty Project → selected generation → existing Work/portal result.
One fresh Sol High read-only review, one focused re-review maximum, then both
exact-merge-SHA workflows and staging identity before closure.

## Local acceptance (2026-09-12)

Implemented and independently reviewed. One canonical-version race finding was
fixed and passed the same reviewer's focused re-review. Enable's final write and
no-op predicate now requires the exact active, sole published canonical v1;
disable remains relaxed. Nine post-preflight interleavings cover all boundaries.
Post-fix: 149 affected / 5,886 full tests, 26 native D1 checks, Cloudflare build,
38 browser/HTTP checks with 11 captures at five widths, syntax and diff pass.
Evidence: `/tmp/bloomops-d2-setup/`. Both exact-merge-SHA gates remain pending.

## Closure (2026-09-12)

PR #46 merged reviewed `469d98748494a1ed7529d9ac3d39e78dcaeecf5a` as
`642009c713daa2ecfb985203aa3f4d5240f4ddcc`, with identical trees. Staging
34681135771 and zero-to-current 34681135753 passed every required step on that
SHA; staging identity and restoration of the eight-database inventory passed.
This completes the integrated D2 acceptance. D2 is closed; D3 Kajabi is next.
No live catalogue binding was performed. Full evidence is in BUILD_STATE.md.
