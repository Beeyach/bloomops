# P3C3C recipient protection preview

Actual built local Worker captures, using an isolated synthetic workspace and intercepted provider traffic. No live email was sent. Existing Bloomsi logo, garden identity, labelled sender/recipient and full-page delivery layout are preserved.

| View | Capture |
| --- | --- |
| Protected duplicate, desktop | [1440px](protected-1440.png) |
| Protected duplicate, phone | [390px](protected-390.png) |
| Narrow phone | [320px](protected-320.png) |

An address with a saved hold, stop or unfinished check cannot prepare or send another introduction through a duplicate prospect in that workspace. The page explains the block and links to its source conversation. Content approval remains visible and does not override recipient protection. The fixed mobile navigation appears at its viewport position in full-page captures; the page scrolls underneath it.

Verification:52 distinct focused tests,20 native D1 checks,51 built-browser checks across1440/1024/768/390/320px, final Worker build, keyboard source navigation and denied stale API submissions. Main94 application tables and credentials unchanged by implementation. No schema/migration change. Independent review is recorded in [BUILD_STATE](../../BUILD_STATE.md).
