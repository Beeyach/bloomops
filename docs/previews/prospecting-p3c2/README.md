# P3C2 controlled test delivery preview

[Authorized single live-test email](proposed-live-test.txt) was accepted by Google on13 September2026; the owner confirmed receipt (folder placement unspecified). The captures below remain the earlier synthetic verification, not a screenshot of that live email.

Local built Worker with synthetic identity, approved content, encrypted grant and intercepted provider egress. No real email was sent or mailbox read. These captures are review evidence, not a staging deployment.

- [Desktop review](desktop.png)
- [Phone review](phone.png)
- [Disabled test](disabled.png)
- [Interrupted request and recovery](recovery-error.png)
- [Google acceptance after receipt recovery](accepted.png)

Final browser acceptance passes 34 checks across 1440, 1024, 768, 390 and 320px. It covers keyboard preparation, explicit acknowledgement, disabled controls, cancellation, duplicate-click prevention, a simulated lost provider response, no resend, focused recovery error, exact-message Sent metadata recovery, authority denials and unchanged legacy send/account tables. Separate native D1 checks pass8/8. [BUILD_STATE](../../BUILD_STATE.md) records independent review and live-test gates.

[Authorized sender/sign-off test](proposed-sender-check.txt) was accepted once by Google at2026-09-13T08:20:00.799Z. The owner confirmed the sign-off is visible but paragraph spacing is too tight. The separately authorized [spaced test](proposed-spacing-check.txt) was accepted once at2026-09-13T08:27:35.008Z; the owner replied perfect. Keep its normal paragraph breaks and spaced closing as the approved convention. Sending is disabled again. No universal Gmail expansion guarantee is inferred.
