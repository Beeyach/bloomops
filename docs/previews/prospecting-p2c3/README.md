# P2C3 controlled manual audit acceptance

P2 is accepted locally. This is a fictional local business website and a synthetic Bloomsi workspace, not a live prospect or an autonomous production audit.

[Calendar popup and iframe](calendar-desktop.png), [rendered programme page](journey-desktop.png), [resulting desktop profile](profile-desktop.png), [phone profile](profile-phone.png).

## What was verified

All 18 checks pass in [the browser/native result](results.json). The actual browser opened a complete directly downloaded PDF, a new-tab About page with current dated activity, a same-tab public Contact page, a calendar dialog/iframe and delayed content. Hidden placeholder text was not visitor-visible. The calendar iframe was scrolled to inspect the visible GoHighLevel attribution. A controlled 503 response stayed an uncertain inspection outcome.

The manual task used an actual canonical context export. Its assistant-authored structured audit saved the observed facts, assessment, source URL/date, proposed course-comparison work and public contact source, while explicitly keeping a newer manual unknown. A following outreach task received those saved canonical values and produced a business-specific intro plus two unsent follow-up suggestions. Sender approval remained unresolved, so the result stayed Needs review. A separate uncertain report did not populate observed facts or imply broken backend processes.

Public contact inspection used the supplied website and its two linked About/Contact research pages. The PDF/calendar were tested interaction targets; the unavailable route was a separate controlled negative case. All fixture server requests were GETs. No form, appointment, payment, email or message was submitted. No real provider, prospect or original-LTB connection was used.

The exact [observations and request paths](observations.json) and [preserved pre-slice rows](preservation-final.json) are recorded. Every prior row in ten watched tables is unchanged, including P2C2 results; integrity and foreign keys pass. No application runtime, migration or dependency changed in P2C3. P2C2's accepted build and independent review remain the runtime foundation.

## Reproduce and limits

With the existing local built Worker running on localhost:8787, use `node scripts/prospect-audit-journey-local.mjs /tmp/bloomops-p2c3-evidence`. The script checks development/r2-dev before creating synthetic fixtures and starts its own localhost-only research server. Existing Playwright/Chromium tooling is required; this environment uses `/tmp/bloomops-pilot-tools` and its documented `LD_LIBRARY_PATH`. Both browser contexts and the research server close at completion.

These cases demonstrate the manual workflow and the written audit corrections with actual controlled browser evidence. They do not establish real-business viability, mailbox delivery, pricing approval, generalized model quality or automatic live-site auditing. The downloaded PDF was checked for exact byte completeness; this harness does not evaluate arbitrary PDF rendering. Full reports and follow-up suggestions remain separate, immutable review artifacts. Existing GHL, direct downloads and direct-message choices are not automatic defects or skip rules.

P2C3 used self-review and focused browser/native evidence under the usage-aware policy: no new production behavior, permission boundary, schema or deployment change. Video work/tests remain paused. P3 outreach/Overview/Results and P4 Pages/P5 conversion remain unfinished.
