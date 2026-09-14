# Prospect sheet screen fit

Owner-requested layout correction, 14 September 2026. Local built Worker with fictional QA records; not a staging capture.

[Desktop](sheet-1440.png), [smaller laptop](sheet-1280.png), [phone](sheet-390.png), [narrow phone](sheet-320.png), [all optional columns](all-columns-1440.png).

The sheet uses the full workspace canvas. Desktop columns share the available width using the existing saved widths as proportions. Business receives more space by default; selected fields and long values remain present. With a container at or below 900px, or more than eight selected fields, each business becomes a full-width row with labelled fields beneath it. Selection, editing and canonical profile links remain the same controls. Body text remains 16px. The desktop header/identity remain sticky; narrow rows keep the page-selection control above the records.

The prospect sheet also overrides the generic navigation sheet's height cap, overflow, shadow and animation. This removes the clipped footer and nested outer scrolling without changing navigation panels.

## Verified

- 33 existing prospect-sheet and draft-recovery tests pass: `node --test tests/bloomops-prospect-sheet.test.mjs tests/bloomops-sheet-drafts.test.mjs`.
- `npm run cf:build` passes, including Next's configured validation. No migration, dependency, backend query, authorization or save/recovery logic changed.
- [27 built-Worker browser checks](acceptance.json) pass. No horizontal page/table overflow at 1920/1440/1280/1024/768/390/320; all seven default fields are displayed at each width. Keyboard resizing, page selection, actual synthetic edit/save/undo, all 17 optional fields, saved wide preferences, phone selection and profile navigation/return pass.
- Screenshots were inspected at 1440/1280/390/320. Full-page phone captures include the existing fixed bottom navigation at the initial viewport boundary; later fields remain accessible by vertical scrolling within the records.
- The initial save assertion checked the fetched row too soon after the Undo button appeared. The final harness waits for the actual saved value and its restoration; it passes. Local synthetic SQLite/R2 copies and browser session material stay outside the repository.

No production/DNS, real import, outreach, paid audit or original LTB/voice changes. Video work/tests remain paused. N1C search stays in its independent draft PR67; broader N1 form recovery is next.

One fresh Sol High read-only review found no material findings. Its additional boundary question was checked at 1208/1220/1240/1260: table, scroll and client widths match exactly (900/912/932/952px), with no source correction required.
