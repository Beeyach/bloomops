# Mailbox review preview

Actual built local Worker, isolated synthetic account and intercepted Google traffic. No real mailbox request or email. Existing Bloomsi logo, shell, icons and tokens are reused.

| View | Capture |
| --- | --- |
| Saved collection, desktop | [1440px](saved-1440.png) |
| Saved collection, phone | [390px](saved-390.png) |
| Narrow phone | [320px](saved-320.png) |
| Empty Overview navigation | [390px](overview-empty-390.png) |
| Before first review | [320px](empty-320.png) |
| Incomplete catch-up and controls, scrolled viewport | [320px](controls-320.png) |

Mailbox review is reachable from Overview and Sender setup. Collection and recent-change checks have separate status labels; historical coverage stays unverified and outreach holds remain. Unassigned counts expose no correspondence or provider IDs. The acknowledgement states that checking collects message headers without sending email.

61 built-browser checks cover five widths (1440/1024/768/390/320), access/body/origin/revision gates, acknowledgement, busy/error/cooldown, saved and incomplete results, keyboard focus/navigation and disabled UI. Two additional viewport checks verify acknowledgement text remains unobscured by fixed mobile navigation at390/320. Full-page screenshots retain the fixed navigation at its initial viewport position; the scrolled viewport capture shows the actual controls. Initial cramped mobile account and undersized checkbox were corrected and the final build/browser run repeated. The external design gallery was inaccessible; existing local design tokens and components were inspected.

43 distinct focused tests pass after correcting a stale shell-route count; final Worker build and main schema/data/credential preservation pass. No schema change. Independent review and current release state are recorded in [BUILD_STATE](../../BUILD_STATE.md). All live flags remain disabled.

Independent review corrections: the read model discards stale summaries after mid-read authority/account/sender changes, covered by four deterministic race tests; the Overview link now remains visible with zero conversations, covered in the built browser. The final build/browser run was repeated after these changes.
