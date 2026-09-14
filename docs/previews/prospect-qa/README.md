# Prospect table and profile QA

The owner reported that selecting dropdown options left their cells unchanged and that the next selection asked to discard changes. The previous implementation deliberately routed each choice to a separate review. [Reproduction](dropdown-reproduction.json) confirms both symptoms. Making that review visible did not meet the expected single-cell interaction.

Platform/Fit now save directly through the existing canonical read/compare/write path. The chosen value appears while saving, with compact Saving/Saved/failure feedback. Custom platform and text editors use one Save field action. Bulk/pasted edits and failed/recovered fields retain explicit review. Success leaves no pending review for the next dropdown to discard. Failed/lost/concurrent saves retain their original field comparison, recovery and safe retry; undo remains tied to existing canonical receipts.

Broader QA also reproduced a successful new-prospect creation being blocked by its own beforeunload warning. The creation flow now disables only that form's warning synchronously after a confirmed save, before navigation. Failed creation continues to keep its input and warn before leaving. The committed [local browser regression script](../../../scripts/prospect-sheet-save-browser-local.mjs) covers both fixes against synthetic records and refuses a nonlocal or nondevelopment target.

## Final verification

The final OpenNext build passes.122 relevant Node tests cover the sheet, drafts, profiles, recovery, creation, imports, conversions and skill results. The23 affected profile/creation tests pass again after the warning fix. **128 final built-Worker browser checks pass:**

- [32 direct save, failure, concurrency, recovery, undo, keyboard/mobile and creation checks](sheet-checks.json).
- [42 profile checks](profile-checks.json): all four editors, source verification, offline and lost responses, concurrent input, reload/back/new-context recovery, storage failures, wrong user/workspace and revoked membership.
- [37 table checks](table-checks.json): six saved views, four page sizes, paging, all date sorts/null placement, filters, saved views, all17 columns, phone layout, bulk review, exports, Sample CSV, existing receipt replay, duplicate preview and malformed input.
- [Six boundary/touch checks](boundary-checks.json): first-tap menus/44px targets, real wrong-user save denial and no stale UI/draft rewrite after context invalidation.
- [11 navigation/data checks](navigation-checks.json): creation, unchanged editor cancel, evidence/website links, search, saved edits leaving filters, Outreach event form, client handoff review and actual25-record same-workspace export/audit packages.

All mutations use an independent copy of the synthetic D1/R2 fixture onlocalhost8805. All provider egress is blocked and the provider log is empty. The task-only Worker is stopped. Two harness assumptions were corrected without runtime changes: this populated fixture already contains the exact sample CSV receipt, and manual audit packages carry canonical IDs under context.prospect. Both actual behaviors are explicitly checked.

Build-reported first-load estimates remain103kB for Home/Clients,112kB for Portal and111kB for Search. Prospecting changes121→122kB. These are rounded build estimates, not production latency measurements. No backend query, schema, dependency or workflow change; no new migrations.

## Visuals

Desktop/phone sheet and profile conflict states were inspected. Full-page phone captures include the fixed navigation at its viewport capture position; controls continue through the existing vertical records area.

- [Desktop direct save](sheet-1440.png)
- [Phone direct save](sheet-390.png)
- [Desktop protected conflict](profile-conflict-1440.png)
- [Phone protected conflict](profile-conflict-390.png)

One fresh Sol High review found no material findings; no re-review was needed. Staging deployment/acceptance are pending. PR73 remains draft; N2 is paused for this owner-requested QA. Original LTB/voices, unrelated work, real outreach/imports, paid/video work, production and DNS remain unchanged.
