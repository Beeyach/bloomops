# Profiles, comments and useful notifications

Owner direction recorded 14 September 2026. Users should be able to add profile pictures and leave comments. The owner confirmed Resend for email and intends to use sender addresses at bloomsi.app. This is a build plan, not a completed domain setup or activated notification system.

## Profile pictures

Add upload, crop, replace and remove actions in the user's existing profile settings. Show the result consistently beside authorized comments and user identity. A photo is optional. Use the existing garden SVG fallback when absent or unavailable, rather than initials/acronym tiles. Preserve the separate Bloomsi platform logo.

Reuse the current user and file-storage systems. Inspect whether identity and photos are account-wide before introducing workspace-specific overrides. Only the user or an explicitly authorized account-management role may change that user's image. Uploads need type, byte-size and decoded-dimension checks. Accept a bounded set of safe raster formats, remove unnecessary metadata, produce a small thumbnail and reject executable or unsupported content. Never trust file extensions alone. Avoid loading the original image at full resolution in every row.

Apply the existing visibility rules to identity and photo URLs. Client users should see only people already appropriate to their portal context. Mention selectors, photo endpoints and caches must not reveal unrelated workspace members. Replacement/removal must update visible references safely and follow existing file-retention rules.

## Comments attached to work

Reuse the existing shared comment/activity model. Start with comments on client records, projects/tasks and deliverables where comments already fit. Add report discussion as part of reporting, linked to the relevant report/version. Do not build a separate general chat product or a comment database for each department.

Support plain readable messages, replies, authorized mentions, edited markers and a resolved state where relevant. Reuse existing rich text only if supported safely. Keep author, time and visibility clearly separated. Respect the owner's rule against cramped metadata chains. Prioritize text comments before extra attachment/reaction features.

Internal comments are the default in the internal app. Client-visible discussion requires an explicit allowed visibility setting with clear wording before posting. Never copy an internal thread into a portal by changing its label without a reviewed authorized action. Client users cannot expose internal threads or mention users they cannot access.

All reads and writes must check workspace, typed parent record, assignment and visibility on the server. Replies inherit the thread's permitted audience. Mentioning someone does not grant access to the underlying record. Editing/removing comments follows existing ownership and retention rules. Client report comments remain separate from the frozen published report content.

Comment resolution is not task completion, approval, report publication or client acceptance. Keep those structured actions distinct. Preserve edited/deleted state appropriately and avoid blank broken threads. User names and images reflect the current authorized identity without losing the recorded author reference.

## Basic in-app notifications belong with comments

Build a small notification inbox with unread/read state and direct links to the relevant record/thread. Initial events are a direct mention, a reply to the user's conversation and a task assignment. Reuse existing event and notification infrastructure. Do not notify every user about every edit, autosave or background job.

Use an explicit recipient policy based on mentions, participants and assignments. Avoid self-notifications and duplicate notifications from retries or overlapping rules. Deduplicate by event and recipient. Provide per-user category preferences and a way to mute a thread. Keep notifications scoped to their workspace and make the destination clear.

Check access at creation and again when listing/opening. Deleted, revoked or newly private targets must not leak through text, unread counts or previews. Reading a notification does not alter the underlying task or comment. Marking all read applies to a clear inbox scope. Error recovery must not create endless spinners or inflated unread counts.

In-app notifications are part of the collaboration phase. They can work without email delivery. Desktop push, mobile push, SMS alerts, complex escalation rules and digest builders are outside the first version.

## Optional email delivery through Resend

Retain the existing Resend integration and any working authentication emails. Add collaboration notification delivery later, after in-app events, permissions and preferences work. Email preferences are separate from in-app read state. Preserve required authentication/security email behaviour and do not classify it as an optional comment notification.

The desired visible From domain is bloomsi.app. A proposed address is Bloomsi <updates@bloomsi.app>, pending the owner's final sender choice and verified configuration. Do not assume this address is already set up. Verify the intended sending domain in Resend using its actual DNS records, preserve existing MX/SPF records and follow the current provider guidance for SPF, DKIM and DMARC alignment. Do not copy placeholder DNS values from a document.

Resend recommends dedicated sending subdomains as an option. That recommendation does not override the owner's requested @bloomsi.app sender or authorize a domain change. Its default return-path subdomain is a different concept from the visible From address. Inspect the current setup before proposing changes.

Sending-domain verification does not create a normal inbox. Configure a real monitored Reply-To destination before shipping emails that invite replies. Resend inbound email handling exists but requires its own setup and processing. Email-to-comment replies are later scope, requiring sender authorization, safe parsing, thread mapping, replay protection and current record access checks. Do not promise replying to a notification already posts a comment.

Recheck recipient preference and record access immediately before sending a queued email. Keep subject/body previews minimal enough to avoid disclosing private information through notifications. Use stable delivery identities and retry rules to prevent duplicate messages, and handle delivery errors without retrying forever. Do not treat opens as proof of reading.

No notification email is sent merely because this plan is committed. Activation requires configured senders, recipients and user settings through the implementation workflow. Keep product notification email separate from the prospecting outreach connection and its approval/suppression rules.

## Acceptance and boundaries

Check image upload/crop/replacement/removal, invalid files, image size, fallback and permission-protected delivery. Verify authorized and denied comments/replies, mentions across assignments/workspaces, internal versus client visibility, edit/remove behaviour and report-version linkage. Verify notification deduplication, preferences, mute, unread scope and permission changes before and after queueing.

For the later email phase, use sandboxed/test recipients and inspect the real sender/domain configuration. Test delivery retries, revoked access, disabled preferences and failed events. Verify source links use the correct environment and open only for authorized recipients. Inspect desktop, narrow layouts, keyboard controls and loading/error states. This plan does not authorize DNS changes, sending tests to real clients or enabling account-wide email delivery.

## Provider references

Checked 14 September 2026:

- [Resend domain setup](https://resend.com/docs/dashboard/domains/introduction)
- [Resend sender addresses after domain verification](https://resend.com/docs/knowledge-base/how-do-I-create-an-email-address-or-sender-in-resend)
- [Resend inbound email](https://resend.com/docs/dashboard/receiving/introduction)
