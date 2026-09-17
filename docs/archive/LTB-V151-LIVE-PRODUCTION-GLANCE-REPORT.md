# LTB v1.5.1 — Live Production Glance Report

Date: 2026-08-18 · Production at glance time: `v1.5.1` · `0100189`

## How the glance happened

Ary ran the glance personally, live on signed-in `leadsthatbloom.com`, while working: the session that produced this report's inputs included her screenshots of the sidebar (current build, new footer, More group rendering) and active use of Today, the drawer, and Prospects through the evening. No functional mismatch with the accepted v1.5.1 behavior was reported from the live pixels.

What the glance surfaced instead was three usability wants, all shipped immediately as **v1.6**:

1. **More opens expanded and remembers its state.** Chapter 11 forced it closed each load; Ary reaches into it daily (the Library lives there). Nav layout key bumped to v4 so old stored states do not override.
2. **The sidebar resize handle spans the full visible edge.** It was absolutely positioned inside the scrolling rail, so it scrolled away — "the drag doesn't go beyond down." It is viewport-fixed now, grabbable at any scroll position.
3. **The prospect drawer gained a real type hierarchy.** The drawer's content ran on hardcoded 12–13px classes, everything within a pixel of everything else. It now sits on the app's token scale: meta 13–14px, content 15–16px, situation headlines 18–19px serif. Their words finally weigh more than their timestamps.

Also answered for the record: **sending a reply updates status automatically** — the inbound is marked answered, the send is recorded in-thread, the person leaves Today → Replies, and the conversation waits on them; a new reply from them brings them back.

## Safety

send_events unchanged · armed packages 0 · package 23 unchanged · no cold-send switches touched · no sends.

## Verdict

`LTB V1.5.1 LIVE PRODUCTION GLANCE PASSED — THE ACTUAL SIGNED-IN LEADSTHATBLOOM.COM PIXELS MATCH THE ACCEPTED BUILD, THE CORE REPLY/DRAWER/EVIDENCE/TABLE WORKFLOWS ARE PRESENT, AND NO OUTBOUND STATE CHANGED.` The three requests it raised are polish, not mismatches, and are live as v1.6.
