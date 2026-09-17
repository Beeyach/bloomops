# Bloomsi documentation routes

[BUILD_STATE](BUILD_STATE.md) is the short current handoff. Read the contract section
needed for the task, not this entire index's destinations. Historical status does
not authorize work. Root agent defaults and safety live in
[AI_WORKING_AGREEMENTS](../AI_WORKING_AGREEMENTS.md).

| Need | Read only the relevant sections |
| --- | --- |
| Product boundaries and release order | [PRODUCT_SPEC](PRODUCT_SPEC.md), [ROADMAP](ROADMAP.md) |
| Entities, lifecycle, authorization invariants | [DOMAIN_MODEL](DOMAIN_MODEL.md) |
| Client/portal and early releases | [RELEASE_A](RELEASE_A.md), [RELEASE_B](RELEASE_B.md), [RELEASE_C](RELEASE_C.md), [RELEASE_D](RELEASE_D.md) |
| Recovery/search and Client edit work | [phases/N1](phases/N1.md) |
| Client overview, discussion and notifications | [phases/N2](phases/N2.md), [COLLABORATION_NOTIFICATIONS](COLLABORATION_NOTIFICATIONS.md) |
| Reporting | [phases/N3](phases/N3.md), [CLIENT_REPORTING](CLIENT_REPORTING.md) |
| Reusable Work and Page templates/context | [phases/N4](phases/N4.md), [PAGES_SYSTEM](PAGES_SYSTEM.md) |
| Prospecting | [PROSPECTING_ROADMAP](PROSPECTING_ROADMAP.md), [PROSPECTING_SHEET](PROSPECTING_SHEET.md) |
| Ads | [RELEASE_E](RELEASE_E.md), [phases/E3](phases/E3.md) |
| Team and Finance | [phases/F](phases/F.md) |
| UI and brand | [DESIGN_SYSTEM](DESIGN_SYSTEM.md), [DESIGN_CHECKLIST](DESIGN_CHECKLIST.md), [BRANDING](BRANDING.md), [visual references](design-references/README.md) |
| Original evidence and old section links | [history index](history/README.md) |

Search code: `python3 tools/agent_context.py search 'symbol'`.
Search current docs: `python3 tools/agent_context.py search 'topic' --scope docs`.
History needs `--scope history --path <specific-file>` and a concrete question.
Root historical reports stay in place to preserve old references and any consumers;
they are not a second current roadmap. Ordinary ripgrep excludes report/history
noise through `.rgignore`; explicit file reads still work.

Keep this index below 4 KiB. Do not append chronological release reports here.
