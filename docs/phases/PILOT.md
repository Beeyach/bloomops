# Internal pilot — staging walkthrough

## Contract

After Release D closed, the owner accepted preparing a practical walkthrough
before beginning Ads. Prepare the existing app for an owner-led trial, capture
friction, and turn confirmed issues into bounded fixes. This is not production
launch acceptance. Release E and further performance work remain unstarted.
[BUILD_STATE](../BUILD_STATE.md) owns progress and evidence.

Preparation is complete when the current staging baseline and public checks are
recorded, the walkthrough matches existing controls, and remaining human or
access prerequisites are explicit. The pilot itself stays pending until Ary and
Ellen exercise the relevant paths and report their results.

## Start here

Open [staging sign-in](https://bloomops-staging.cool-sunset-2169.workers.dev/sign-in)
and use your existing bootstrapped Owner/Admin email. Open the magic link from
your own mailbox. A successful form submission alone does not prove delivery or
membership. If the email does not arrive or access is denied, report the visible
message and approximate time; do not share the magic link or a session token.

Use synthetic business data only. Name the example Client **Pilot — Demo Studio**
so it cannot be mistaken for a real engagement. Ary can coordinate the Systems
steps while Ellen tries the day-to-day Client and Social workflow. Record missing
access instead of changing roles or copying production data to make a step pass.

For the portal portion, choose a separate owner-controlled email that is not an
internal workspace member. **Activate Client sends a real portal invitation to
the primary contact.** Confirm the controlled recipient before activating; no
invitation has been sent as part of preparation. Use another browser profile for
the Client session so internal and portal identities remain distinct.

## Walkthrough

Allow roughly 30–45 minutes initially; pause and record confusing steps rather
than trying to finish every lifecycle in one sitting.

| Step | Try | Look for |
| --- | --- | --- |
| 1. Find today's work | Open Home, Clients, Work, Social and Systems. In Work, try both Actions and Projects (`/work?tab=projects`). | You can tell what needs attention and reach its underlying record without help. |
| 2. Set up a demo Client | Create the synthetic Client and add purchased Social, GHL and Kajabi services if their catalogue entries exist. Check contact details before controlled activation. | Separate purchased engagements remain attached to one Client; onboarding requests make sense. Record missing catalogue/setup as a prerequisite. |
| 3. Follow onboarding | Read the generated requests and complete a harmless demo requirement. Use a waiver/not-applicable resolution only when appropriate, with a reason. | The next request and outstanding owner are understandable; nothing asks you to store provider passwords. |
| 4. Prepare Social content | At `/social/new`, choose the demo Client and its Social engagement. Add a title, caption and workflow requirements. Progress through the applicable stages. | Waiting/revision context is clear, saved content persists, and the next stage matches the chosen requirements. |
| 5. Try Client approval | Choose **Client eligible** visibility, enable Client approval and reach **Client Review**. Use **Request Client approval**. In the controlled Client session, open portal Home and respond. | The Client sees the requested snapshot; internal notes stay private. No notification is sent for this approval request. Recordings/assets are not part of the snapshot. Withdraw an open request before changing its reviewed copy. |
| 6. Prepare Systems work | Inspect `/settings/ghl-builds` and `/settings/kajabi-builds`. If setup is needed, the authorized coordinator explicitly selects the intended active Systems service type, reviews it and enables builds. Create a separate planned, empty Project for each demo Systems engagement. | Each platform is explicitly bound to the intended service type; no automatic name matching or mixing of GHL/Kajabi work. Do not replace unrelated bindings. |
| 7. Run a small build | On each Project choose **Start GHL build** or **Start Kajabi build**, select a small relevant set including QA/review/handoff, preview and generate. Follow [Running a Systems build](../SYSTEMS_DELIVERY.md). | Systems and Work show the same canonical progress. QA completion does not approve a Deliverable. Client Review here is recorded by the internal coordinator, unlike Social's portal approval request. |
| 8. Check handoff and privacy | Upload a harmless text file to a demo Deliverable. Check it is initially internal, then deliberately make its Project, Deliverable and File client visible. Open portal Home in the controlled Client session and download it. | Your projects and Shared files show the intended client-facing information and exact file contents. Internal actions/QA/notes remain private. Hiding the File removes Client access. |
| 9. Return as an operator | Reopen Home, Work and Systems; inspect waiting work and the next steps. | You and Ellen can identify what remains without consulting a developer. |

Record only actual demo events as complete. BloomOps does not publish to social
platforms, GHL or Kajabi from these controls. Leave external launch/publishing
steps unfinished during this trial. Do not delete existing staging records to
clean up the demonstration; leave the clearly labelled pilot records for review.

## Feedback and exit

Send a short note per issue: **step/page → what you expected → what happened →
whether it prevented continuing**. Include the role and device width/type when
relevant, but no sensitive customer data, email links or credentials.

The human pilot passes when both operators can follow the applicable paths, the
controlled Client can review content and retrieve only intended handoff files,
and any blocking issues are resolved and rechecked. Document skipped steps and
missing account/catalogue prerequisites; they do not count as passes. Prioritize
access/data/privacy defects first, then confusing workflow or missing essentials,
then cosmetic friction. Record results in BUILD_STATE before proposing Release E.

## Readiness evidence — 2026-09-12

- Public GET checks: version `844ac90`; health reports `staging`, configured auth,
  Resend transport and 21 migrations with schema OK. Sign-in returns 200; `/`
  redirects to sign-in; `/api/bloomops/me` returns 401 anonymously; session is null.
  These prove public boundaries, not mailbox delivery or a usable signed-in account.
- The version endpoint's inherited `Production` label derives from the `main`
  branch. The health endpoint identifies the actual environment as staging.
- A read-only remote D1 query for membership aggregates, catalogue bindings and
  aggregate record counts failed with Cloudflare code 7403 (account invalid or
  unauthorized). Those current values remain unverified; no database write ran.
  Check prerequisites through the signed-in UI before the corresponding steps.
- Release D's completed automated and independent acceptance is recorded in
  [D7](D7.md). It supports this trial but does not replace human acceptance.
- Production configuration still contains the D1 placeholder and lacks an app
  origin in `wrangler.jsonc`; no production deployment workflow is configured.
  Production provisioning, sender/origin validation, mailbox delivery, and
  operational restore/rollback acceptance need a separate launch task. This
  limited inspection does not establish the state of every remote resource.

No runtime, schema, configuration or credentials changed. No mail was sent,
provider action performed, or deployment triggered during this preparation.
This documentation/planning task uses self-review and link/route/diff validation;
it does not trigger another independent application audit under the usage-aware
policy. No main-session model/effort change is needed. Any later task requiring a
change will be flagged before implementation; qualifying fixes get Sol High review.

## Pilot fix — actionable onboarding (owner feedback, 2026-09-12)

The owner reached the portal and saved a confirmation but could not find an
agreement destination or an asset-upload path. They also found the page too
text-heavy and requested icons, with **no emojis**. Address this before asking
for more checklist confirmations. This extends the earlier A10 confirmation-only
scope; it must not be presented as already implemented.

Acceptance for the bounded fix:

- Each actionable step gives concise instructions and a genuine next action.
  Authorized agency staff can provide the relevant agreement/scheduling/share
  destination; missing configuration is clearly identified. Never invent a URL
  or imply that a document has been supplied or signed when it has not.
- Brand-asset submission has a real supported destination. Prefer existing D1/R2
  foundations for an onboarding-scoped upload; inspect parent ownership, file
  limits, access revocation and receipt/retry behavior before designing changes.
  Do not grant general Project file-write access to Clients to achieve this.
- A saved acknowledgement is distinct from received evidence, team verification
  and actual completion. Preserve deliberate external-step confirmations while
  making their meaning clear. Resolve the required evidence contract before
  changing lifecycle rules; existing completed demo records are not silently reset.
- Preserve immutable master versions and generated snapshots. Existing onboarding
  instances need an explicit supported configuration path; changing bootstrap
  defaults alone does not fix this pilot. Any required schema change is migrated.
- Reduce repeated headings and metadata. Use the existing SVG line-icon system
  for meaningful actions/status cues, with accessible text labels and concise
  instructions. No emoji, icon-only essential actions or decorative icon spam.
- Verify actual agency setup → Client action → persisted submission → relevant
  verification flow, missing configuration and safe links, cross-Client/tenant
  denial, current contact/membership revocation, file privacy and retry behavior.
  Use focused invariant tests plus native D1/R2 checks if storage changes and a
  stable local Worker/browser check at all five design widths. Inspect captures,
  keyboard/focus and reduced motion; preserve unrelated portal sections.
- Recommend main-session **Astra High** before implementation; do not claim to
  switch it automatically. One fresh **Sol High** read-only review is required
  for the completed change, with at most one focused re-review if fixes require it.
  No production rollout, provider integration, paid service or real mail is needed
  for local acceptance. Use the existing authorized staging publication workflow
  only after the complete change passes its required gates.

### Implementation decision

This slice supports **explicit external destinations**, including an existing
upload-request/folder link with Client upload permission. Existing Files are
Project/Deliverable-scoped; the Client cannot upload general Project Files.
Creating a native onboarding attachment model would expand that authorization
and storage contract. No native uploader, file receipt, e-signature or provider
execution is introduced here. Opening a destination is never evidence of work;
confirmation and existing required team verification remain explicit. External
folder permissions remain the agency's responsibility, and must be checked with
the intended Client account before sharing. Revoking BloomOps access hides the
portal/destination; it does not revoke an already shared external URL.

`0021_pilot_onboarding_guidance.sql` adds four columns to existing items without
rebuilding the table. Original instructions and master/generated snapshots stay
unchanged. The runtime override stores instructions, action type, URL and revision.
Owner/Admin/Project Manager configure open, client-responsible, client-visible
steps under current scope. Submitted/completed steps freeze their guidance and
retain history; they are not reopened or silently rewritten. Unconfigured open
Client steps wait for setup and cannot submit; existing completed steps remain
complete. The API pins Client confirmations to the displayed guidance revision.

The owner asked whether this is template-based: yes, existing service templates
generate each Client's checklist; these controls configure that Client's copy.
A visual master-template editor remains a separate unimplemented task.

### Operator path after deployment

1. Internally, open the demo Client's **Onboarding** tab and **Set up step**.
2. Write concise Client instructions. Choose **Open agreement**, **Open upload
   folder**, **Book kickoff**, **Set up access**, **Open instructions**, or
   **Confirmation only** for a clearly explained task completed elsewhere.
3. Add the actual HTTPS destination when required, verify that the intended
   Client can use it, then **Save instructions**. Setup sends no notification.
4. Refresh the Client portal. Follow the destination, complete the actual work,
   then **Confirm completed** or **Submit for verification**. Opening the link
   alone leaves the step unfinished. The agency uses **Verify step** where required.
5. **Show completed** reveals preserved history. A stale setup/confirmation asks
   for a refresh instead of overwriting another person's instructions.

For the synthetic pilot, use a controlled test document/folder; do not mark a
real agreement signed or assets received merely because the button worked.
