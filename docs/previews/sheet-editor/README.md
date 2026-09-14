# Compact prospect editing

The owner requested a smaller Contact editor, clearer Save buttons, removal of the earlier-visit recovery banner and removal of Source details for current platform. Read-only staging reproduction measured a Contact row growing from70.19px to109px on edit; the original Save control had no visible text. No record was changed by that reproduction.

The table now keeps its read content as a hidden, inert sizing placeholder while a compact editor occupies the same row. Save has a visible label and primary styling; Cancel stays an accessible icon. Phone labels stay clear, inputs remain16px and controls44px. Text commits still use the existing explicit save, compare/retry and Undo path. Earlier copies remain accessible through the compact Drafts toolbar disclosure instead of a separate banner. Storage/authority behavior is unchanged. The full profile omits only the platform source-detail control; stored provenance and other source controls remain.

## Verification

- Final `npm run cf:build` passes;35 focused Node sheet/draft tests pass.
- [59 inline/editor checks](inline-checks.json), [32 save regressions](save-checks.json) and [21 quiet-save regressions](smooth-checks.json) pass on the final built Worker, isolated synthetic D1/R2 on8808. All provider egress is intercepted; zero calls.
- Contact row/cell height changes by less than1px at1440/1024/768/390/320, with readable input width, visible Save, no label overlap and no viewport overflow. Opening/cancelling creates no writes or drafts.
- Drafts menu bounds pass at those five widths. Restoration, current-value conflicts, multiple queued cells, lost replies, copy-cap preservation/retirement and denied authority retain existing checks. The profile platform control is absent while other source editors remain.
- Initial profile assertion used the wrong Public contact email label and omitted the Optional suffix in its input lookup. The final assertion uses the actual source label and waits for the canonical labelled input id. Initial phone visual inspection found label overlap; the final CSS and regression cover its correction.
- Home/Clients103kB, Portal112kB, Search111kB and Prospecting123kB rounded first-load estimates are unchanged. No backend queries, schema, migration, dependency or workflow change.

[Desktop editor](desktop.png), [phone editor](phone.png), [desktop Drafts](drafts-desktop.png) and [phone Drafts](drafts-phone.png) were visually inspected. Full-page phone screenshots include fixed navigation at its capture position.

One bounded Sol High review found overlapping Drafts and Filter menus. Drafts now uses the same panel state as the other toolbar menus; switching in both directions has a regression at all five widths. The rebuilt Worker passes all112 browser checks, including menu switching at five widths. The single focused Sol High re-review accepted the correction with no remaining material findings. Staging acceptance is pending. PR73 stays draft/unmerged and N2 is unstarted. Original LTB/voices, other worktrees, production/DNS, real imports/outreach and paid/video remain unchanged.

Menu alternation uses pointer clicks at1440/1024/768 and focused keyboard Enter at390/320. Existing phone menus are fixed near the top of the viewport and can cover other toolbar triggers while open; close the open menu before switching by touch. An initial all-pointer alternation check timed out on a covered trigger, so the final check explicitly distinguishes input methods. Single-menu visibility is verified in both directions. This change does not redesign all mobile toolbar menus.
