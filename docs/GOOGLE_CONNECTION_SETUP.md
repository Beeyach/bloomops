# Google connection setup for Bloomsi Prospecting

P3B implements connection and address verification locally. It has not been deployed. The real local consent/account-verification path now passes for `hello@bloomwired.io` in the separate `Bloomsi Google Test` workspace. Sending stays off. The saved sender is workspace-owned; the owner's chosen address is `hello@bloomwired.io`, which may be a primary address or an accepted send-as alias.

The owner reports creating Cloud project **`bloomsi`**. The owner reports reaching Auth Platform overview after the guided Internal-audience setup. Read-only Cloud Console inspection now verifies Gmail API Enabled, OAuth audience Internal and the intended account `hello@bloomwired.io` in project `bloomsi`. The owner reports creating `Bloomsi Local Development` using the local callback below. The downloaded JSON is verified for project `bloomsi` and the exact local-only callback. Dedicated local settings are installed, with Git exclusion, private file permissions, preserved prior configuration and encryption checks independently reviewed. Google Cloud sign-in is complete. The owner selected `ary@bloomwired.io` for the local app login, separate from the Google sender `hello@bloomwired.io`. The selected local Owner is signed into the separate `Bloomsi Google Test` Prospecting workspace. Sender `hello@bloomwired.io` is saved and sending remains off. The owner approved consent, but the initial callbacks failed because Cloudflare rejects the fetch `error` redirect mode before network access. The local fix uses `manual` and rejects3xx without forwarding credentials; 26 focused tests, native workerd success/redirect coverage and the Worker build pass. A controlled invalid-code request through the built app now reaches Google. A fresh Sol High read-only review of the redirect fix found no material issue. The owner approved fresh consent and the callback now shows Connected with sending off. The authenticated status API and native D1 verify matching sender/account, both scopes, an encrypted grant and exactly one connection event; prior rows and legacy accounts/send records remain unchanged. All prior local application rows are preserved, integrity/FKs pass, and the private one-use sign-in handoff is closed. A fresh Sol High read-only setup review found no material issue. No staging callback or deployed secret is being configured in this step.

## What the owner needs to supply

Access to the Google Cloud project that should own Bloomsi's OAuth client, using the Google Workspace account that can send from the chosen address. A mailbox password is not needed. Do not paste client secrets, encryption keys, authorization codes or tokens into chat, PRs or logs.

Before changing cloud configuration, confirm the target project and test environment. P3B code is currently local and uncommitted; staging must first receive an explicitly approved, reviewed release. Do not register a production callback or change DNS for this slice.

## Prepare the Google client

1. In the selected Google Cloud project, enable the Gmail API and configure the OAuth consent screen for Bloomsi. Choose an audience appropriate to the actual project/Workspace organization. For an external testing app, allow the actual Google account as a test user. Do not infer organization eligibility from the mailbox domain.
2. Create a dedicated **Web application** OAuth client. Register the exact callback for the environment being tested:

   | Environment | Exact authorized redirect URI |
   | --- | --- |
   | Local development | `http://localhost:8787/api/bloomops/prospecting/google/callback` |
   | Existing staging, after approved deployment | `https://bloomops-staging.cool-sunset-2169.workers.dev/api/bloomops/prospecting/google/callback` |

   These follow the current `BLOOMOPS_APP_URL` in `wrangler.jsonc`. Do not substitute the legacy `/api/gmail/` callback. If the configured origin changes, update the registered URI before connecting.
3. Configure the requested permissions: `https://www.googleapis.com/auth/gmail.readonly` and `https://www.googleapis.com/auth/gmail.send`. The app requires both plus a refresh token. Connection checks only the mailbox profile and send-as list; it does not read messages or send mail. Partial consent fails safely.
4. Store the dedicated client ID/secret and a new random token-encryption key in the approved environment's private configuration. Local values belong in the existing ignored `.dev.vars`; deployed values belong in Worker secrets through the established deployment process. Preserve other values. Do not copy LTB's client, connection or key.

   | Name | Value |
   | --- | --- |
   | `BLOOMOPS_GOOGLE_CLIENT_ID` | Dedicated web client ID ending in `.apps.googleusercontent.com` |
   | `BLOOMOPS_GOOGLE_CLIENT_SECRET` | Dedicated web client secret |
   | `BLOOMOPS_GOOGLE_TOKEN_KEY` | 32 cryptographically random bytes, encoded as 64 hex characters |
   | `BLOOMOPS_GOOGLE_CONNECT_ENABLED` | `true` only when setup is approved and ready |

   Keep the encryption key stable for stored grants; replacing it makes existing grants unusable and requires reconnection. There is no legacy or plaintext fallback.

Google documents the client, exact redirect matching, consent, offline access and testing refresh-token limitations in its [web-server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server). The [send-as listing reference](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings.sendAs/list) confirms that readonly permission can inspect primary and custom sender addresses. Google may require additional app verification or organization approval for the chosen audience; the configured Internal audience and successful local grant are now verified for this account. Other organization/account restrictions are not inferred from that success.

## Controlled connection acceptance

Use the intended fresh Prospecting workspace as its current Owner/Admin. Save the sender, select **Connect Google**, then choose the Google account that owns the mailbox or accepted alias. Approve the requested permissions. The callback returns to Sender setup, showing the verified primary account and a Connected status. Sending must still show off, with no message, job, approval or Results counter created.

Also exercise cancelled/partial consent, an account without the sender address, and local disconnect/reconnect. Disconnect clears only this workspace's stored grant and invalidates outstanding callbacks; it does not revoke other Google grants. Confirm original LTB data and connections remain unchanged. Record the actual target, deployed revision and outcome in BUILD_STATE without credentials or callback URLs containing query parameters.

P3C1 adds **Check connection**: refresh access and verify the account/sender without another consent prompt. Expired access shows Check needed; temporary failures preserve the encrypted grant for retry; confirmed invalid access requires reconnection. The reviewed controlled live refresh now passes for the existing owner grant. Checks do not send mail or continuously monitor revocation. Sending, reply ingestion and delivery recovery require the next P3 contract and controlled acceptance before real outreach.


## Controlled delivery test gate

P3C2 implements the local test receipt/review and one-time introduction path. Real sending remains disabled. `BLOOMOPS_GOOGLE_TEST_SEND_ENABLED=true`, `BLOOMOPS_GOOGLE_TEST_DELIVERY_ID` and an exact `BLOOMOPS_GOOGLE_TEST_RECIPIENT` must be explicitly configured only after owner approval of the recipient and reviewed message. The app also requires development, loopback and r2-dev; deployed environments cannot activate this path. Do not change the encryption key or copy a legacy grant.

The review lives at `/prospecting/<prospect-id>/delivery`, linked from the outreach draft. Preparation/cancellation make no provider request. Send requires a separate acknowledgement and current healthy Google access; use Check connection if access has expired. If submission is interrupted, inspect the permanent receipt. Never resend manually to work around an unresolved result. Check sent receipt searches only that exact message in Sent and cannot turn an absent result into retry permission. A submitted receipt cannot be recalled or reopened. A real test must use one owner-controlled inbox, and its actual arrival must be confirmed separately.

Live test record: the owner explicitly selected aryannelombres@gmail.com for the reviewed single introduction from hello@bloomwired.io. Google accepted it on2026-09-13 at08:06:31.349Z. Only the named receipt/recipient was enabled in a temporary local process; that process is stopped and the normal preview reports enabled:false/canSend:false. `.dev.vars`, Google credentials and key are unchanged. One attempt and one acceptance are recorded; inbox placement confirmation is pending. No further email is authorized.

Owner subsequently confirmed receipt, reported the sender name Ary was insufficient and Gmail hid the final sign-off. Workspace sender name is now Ary at Bloomwired (revision2) through the existing API. Its From header is verified locally; existing accepted mail is unchanged. The separately authorized compact-sign-off test was accepted once at2026-09-13T08:20:00.799Z; the owner confirmed the sign-off is visible but paragraph spacing is too tight. The subsequently authorized spaced test was accepted once at2026-09-13T08:27:35.008Z; the owner replied perfect. The normal preview has sending disabled again. This accepts the observed presentation, not a universal Gmail expansion guarantee.


## Exact-thread reply acceptance

P3C3B adds saved header-only checks of one accepted conversation, conservative holds and permanent human stop evidence. The built local path is verified with synthetic provider traffic; independent review is accepted. Ordinary page/API reads use local records only. The normal preview keeps checking disabled.

After local acceptance and the owner's separately bounded live authorization, a temporary local preview may set `BLOOMOPS_GOOGLE_REPLY_CHECK_ENABLED=true` and `BLOOMOPS_GOOGLE_REPLY_DELIVERY_ID=4502eb1e-166d-4983-abfb-7e753be519a8`. This is the existing **Bloomsi paragraph spacing check** conversation, Google thread `1a099e1072d8810f`, sent from `hello@bloomwired.io` to the owner's selected inbox. Ask the owner to reply to that email and authorize one header-only check. Keep `BLOOMOPS_GOOGLE_TEST_SEND_ENABLED=false`; do not send a new test. The helper is prepared privately but has not been started. If access expired, use the existing explicit **Check connection** action under the previously authorized connection lifecycle; preserve the encrypted grant and key.

Then acknowledge and check once, verify an exact-thread incoming observation and durable hold without exposing body/raw headers, and restore the normal disabled preview. Do not record a permanent opt-out/decline without corresponding owner evidence. This controlled acceptance is not permission for broad mailbox discovery, background monitoring, new sends, real outreach or deployment. See [P3](phases/P3.md) and [BUILD_STATE](BUILD_STATE.md).

The first authorized exact-thread check completed at2026-09-13T09:27:55.176Z as unresolved/held, with zero verified observations. The original grant was refreshed successfully first; no new credentials or consent. That one-check authorization is consumed and normal preview checks/sending are disabled. A second check needs separate approval after the prepared private diagnostic helper passes review. It will record only status/count/validation flags, not raw metadata or content. No new reply or outbound email is required. See the latest BUILD_STATE before following the historical acceptance instructions above.

The owner subsequently authorized and completed the single diagnostic check. Its sanitized flags identify a returned/submitted RFC-ID mismatch on the exact accepted SENT provider message. Both live-read approvals are consumed. A local fix now traces ancestry using the returned identity of that exact message while retaining account/thread/provider-ID/SENT/address checks and immutable receipt provenance.72 focused,17 native and41 browser checks plus the final build pass; independent Sol High review is accepted. Now, one further header-only verification check needs owner authorization. The one-use diagnostic helper has a consumed attempt marker and must not rerun. The ordinary exact-receipt temporary preview can verify the corrected built UI path after approval; sending stays off. Current BUILD_STATE supersedes the earlier gate text above.

The corrected built UI successfully verified the original test conversation at2026-09-13T09:50:08.440Z, saving one exact-chain incoming reply observation and checked/held state. P3C3B live acceptance is complete. The owner explicitly asked to stop requesting permission per routine attempt; necessary checks of this existing test conversation are now covered by standing authorization. This supersedes the historical one-check gates above. Sending remains off. P3C3C also protects the original recipient across duplicate prospects without any new provider access; see BUILD_STATE for current local acceptance and review.
