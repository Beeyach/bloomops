// Personalized Cowork skill templates. The Automation guide fills these
// with the user's brand, who they help, their app URL, and an optional
// Google Sheet, then packs each into a .skill (a zip holding SKILL.md) the
// user downloads and installs in Claude. Placeholders are plain {{TOKENS}}.

function clean(s, fallback) {
  const v = String(s || '').trim();
  return v || fallback;
}

// Build the skill definitions from a profile.
// profile: { brand, who, appUrl, sheetUrl, senderEmail, countries }
export function buildSkills(profile = {}) {
  const brand = clean(profile.brand, 'my business');
  const who = clean(profile.who, 'the people I help');
  const appUrl = clean(profile.appUrl, 'https://leadsthatbloom.com');
  const sheetUrl = clean(profile.sheetUrl, '');
  const senderEmail = clean(profile.senderEmail, 'my sending Gmail');
  // Optional country batch for the email follow-up sweep (timezone batching:
  // e.g. "AU,NZ" for a 5 PM PST run that lands next-morning down under).
  // Blank = all countries.
  const countries = clean(profile.countries, '')
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  const sheetLine = sheetUrl
    ? `Your lead source sheet: ${sheetUrl}. Read new rows from there before searching, and mark rows you have imported so you never double-add.`
    : 'You are not using a Google Sheet, so source leads from the safe-lane searches below.';
  const countryFilterLine = countries.length
    ? `Only prospects whose country is ${countries.join(' or ')} are in scope for this sweep (timezone batching — run it when their morning inbox opens). Everyone else is left for a different run.`
    : 'All countries are in scope — this sweep processes every due prospect regardless of timezone.';
  const countryFilterJs = countries.length
    ? `const SCOPE = new Set(${JSON.stringify(countries)});
const inScope = p => SCOPE.has((p.country || '').toUpperCase().trim());`
    : `const inScope = () => true; // all countries`;

  const sweep = `---
name: bloom-lead-sweep
description: "Daily social lead sweep for ${brand}. Use whenever I say 'run the lead sweep', 'stock the inbox', 'find leads today', or on a daily schedule. Reads my intent phrases from the app Settings, searches two platforms in the safe lane, collects fresh buying-intent posts, dedupes by URL against my inbox, and adds new leads to my app. Read-only on platforms, writes only to my app. Never sends messages, never logs into any social account."
---

# Bloom Lead Sweep for ${brand}

You are the Scout Bee on a schedule. Your job: find fresh posts where someone is asking for what ${brand} sells, and put them in my inbox. Nothing else.

My app is at ${appUrl}. I help ${who}.

${sheetLine}

## Preflight (stop conditions)

Stop and report, do not guess, if any is true:
- The app does not load, or fetch('/api/settings') from the app tab does not return JSON with a settings object
- Settings has no intent phrases. Tell me to add phrases in the Inbox Find panel first

## Step 1. Read my profile

Open ${appUrl}. In the page console:

const settings = (await (await fetch('/api/settings')).json()).settings;
({ phrases: settings.intentPhrases, platforms: settings.platforms, who: settings.positioning || settings.offer });

## Step 2. Pick two platforms

Rotate through settings.platforms, two per run, so activity stays human. Valid values: Facebook, Threads, Instagram, LinkedIn, Upwork, Reddit, X, Other.

## Step 3. Search the safe lane only

For each platform, search 3 to 5 of my intent phrases using only:
- Logged-out platform search pages
- Google with site: filters, like site:reddit.com "PHRASE"
- Reddit JSON: add .json to a Reddit search URL
Never log in anywhere.

A post qualifies when all are true: posted in the last 7 days, a real person or business asking for the thing ${brand} does, and you have a public URL. Do not collect other providers advertising, or anything older than 7 days.

## Step 4. Dedupe against the inbox

const existing = new Set(((await (await fetch('/api/leads')).json()).leads || []).map(l => l.post_url).filter(Boolean));
Skip any candidate whose URL is already there. Count the skips.

## Step 5. Add the new leads (cap 15 per run)

await fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ platform: 'Reddit', post_url: 'https://...', post_text: 'the ask, quoted', author_name: 'Name', notes: 'via sweep, phrase: PHRASE' }) });
Verify: re-fetch /api/leads?status=new and confirm the count grew.

## Step 6. Report
Leads added as a table, duplicates skipped, phrases that found nothing, and which two platforms are next in the rotation.

## Safety (non-negotiable)
Never log into any platform. Never send, comment, like, or follow. Two platforms and 15 leads per run maximum. No URL, no lead. If a write fails twice, stop and report.`;

  const prescreen = `---
name: bloom-lead-prescreen
description: "Batch lead prescreening for ${brand}. Use whenever I say 'prescreen the inbox', 'score the leads', 'judge the inbox', or on a daily schedule. Reads every unscored lead from my app, verifies the author is a real live business with public checks (and the Facebook Ad Library for FB pages), applies my green and red rules from Settings, and writes verdicts with reasons back to the app. Never messages anyone."
---

# Bloom Lead Prescreen for ${brand}

You are the Guard Bee on a schedule. Give every unscored inbox lead a green or red verdict with reasons, written back into my app. Nothing else.

My app is at ${appUrl}. I help ${who}.

## Preflight (stop conditions)
Stop and report if the app does not load, or Settings has no green rules and no red rules and no positioning. You would be judging with no law.

## Step 1. Read the law
const settings = (await (await fetch('/api/settings')).json()).settings;
({ green: settings.greenRules, red: settings.redRules, who: settings.positioning || settings.offer });

## Step 2. Get the docket
const leads = ((await (await fetch('/api/leads?status=new')).json()).leads || []).filter(l => !l.verdict);
If empty, report "Inbox is clean" and stop.

## Step 3. Judge each lead
3a. Read the ask. post_text is the main evidence. Match it against the green and red rules.
3b. Verify the author is real with one public web search for the name or handle. Two minutes max. Never log in, never open a chat.
3c. Facebook pages get the ad check: search https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&q=BUSINESS. A business paying for ads while asking for help is a prime green.
3d. Verdict, green or red, no maybe. Tiebreaker: is this a real ask, from a real business, for what ${brand} sells, recent enough to still be open? If you are reaching, red.
3e. Write it back:
await fetch('/api/leads/' + lead.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ verdict: 'green', verdict_reasons: ['reason one', 'reason two'], status: 'qualified', notes: (lead.notes ? lead.notes + '\\n' : '') + 'prescreen: what you verified' }) });
Green maps to status qualified, red maps to skipped.
3f. Verify: re-fetch the lead and confirm verdict changed before moving on. If a write fails twice, skip and flag it.

## Step 4. Report
Counts of green, red, and errors. The greens as a table with the winning reason. Any lead where the Ad Library check fired. Any pattern worth telling me.

## Safety
Public checks only. Verdicts come from my rules, not your taste. Never overwrite an existing verdict. Evidence in every reason.`;

  const followup = `---
name: bloom-followup-sweep
description: "Daily follow-up drafting sweep for ${brand}. Use whenever I say 'run the follow-ups', 'draft today's DMs', 'what is due', or on a daily schedule. Reads due and overdue follow-ups from my app, drafts a DM for each in my voice using my own templates, presents the batch for me to send, then stamps contact dates after I confirm. Drafts only. Social DMs are never auto-sent."
---

# Bloom Follow-Up Sweep for ${brand}

You are my daily ritual for the social pipeline. Find everyone due a touch, draft the DM for each in my voice, hand over the batch, and stamp the app after I send. You never send anything yourself.

My app is at ${appUrl}. I help ${who}.

## Why drafts only
Social platforms ban accounts for scripted messaging, and my profile is my storefront. You do the reading, thinking, and writing. I do the sending from my real account. Never offer to send.

## Preflight
Stop and report if the app does not load or window.bloom is undefined in the app tab.

## Step 1. Find who is due
const today = new Date().toISOString().slice(0, 10);
const due = window.bloom.getProspects().filter(p => (p.next_action_date && p.next_action_date <= today) || p.due === true);
If nothing is due, report "Nothing due today" and stop.

## Step 2. Load my voice
Pull my DM templates: const groups = (await (await fetch('/api/library?category=workspace')).json()).groups;
Find the outreach/DM group. These are skeletons. Personalize every draft from the prospect's own data. Voice rules: plain words, no exclamation marks, no emojis in the body, no metaphors, no "just checking in", one concrete observation per message, short.

## Step 3. Draft, one per prospect
Read the row with window.bloom.findByEmail(email). Pick first follow-up, second follow-up, or revival. Personalize with one specific detail. If a prospect has had 3 or more touches with no reply, do not draft. Add them to a move-out list instead.

## Step 4. Present the batch
One block per prospect with name, business, channel, last touch, and the draft. Then the move-out list. Ask me one thing: say 'sent' plus the names once they are out and you will stamp the dates.

## Step 5. Stamp after I confirm, only
For each confirmed prospect:
await window.bloom.setLastContact(email, today);
await window.bloom.setNextActionDate(email, /* today + 3 days */);
Verify each. If I never confirm, stamp nothing.

## Step 6. Report
Drafted, stamped as sent with next due dates, moved-out candidates, and anything odd.

## Safety
Never send a DM, comment, or connection request. Never stamp before I confirm. Never draft touch 4 or later. Never invent personalization details.`;

  // ── Website/email pipeline skills ──────────────────────────────────────
  // These two run the COLD EMAIL lane: prospects with a website and an email
  // address. They can send email autonomously via Gmail in the browser
  // because email has no platform ban risk. They never touch social DMs.

  const emailFollowup = `---
name: bloom-email-followup
description: "Daily cold-email follow-up sweep for ${brand}. Websites/email pipeline only — never social DMs. Use whenever I say 'run the email sweep', 'send today's follow-ups', or on a daily schedule. Reads due prospects from my app at ${appUrl}, sends the next email in each prospect's stored sequence from ${senderEmail} via Gmail in the browser, swapping in the audit-video wording when a rendered video is waiting, and advances the stage. Pre-authorized to send email autonomously."
---

# Email Follow-Up Sweep for ${brand}

Daily follow-up sweep for the cold-email pipeline. Reads who is due in my app, sends each prospect the next email of their stored sequence via Gmail, advances the stage. Email only — this skill never sends a social DM.

My app is at ${appUrl}. I help ${who}. Send only from ${senderEmail}.

${countryFilterLine}

## Preflight (stop conditions)

Stop and report, do not guess, if any is true:
- The Chrome extension is not connected
- ${senderEmail} is not the signed-in Gmail account
- The app shows the access-code gate. Ask me to log in; never type my code yourself.

## Step 1. Who is due

Open ${appUrl}, open the Prospects view once so window.bloom exists, then:

${countryFilterJs}
const due = window.bloom.getDue().filter(p =>
  ['Email 1','Email 2','Email 3','Email 4'].includes(p.stage) && p.email && inScope(p));

If nothing is due, report "Nothing due today" and stop.

## Step 2. For each due prospect, in order

2a. The next email is number N = current stage number + 1 (stage "Email 2" means send Email 3). Read it:
const p = window.bloom.findByEmail(EMAIL);
const next = (p.email_sequence || []).find(e => e.number === N);
If it is missing, skip and flag — never improvise an email.

2a-video. Some emails carry a second wording written around an audit video, stored on the same entry as \`body_video\`. Use it instead of the standard body when ALL of these are true, and use the standard body whenever any one of them is not:
- \`p.video_url\` is set (the video actually finished rendering)
- \`p.video_sent_at\` is empty (this prospect has not already been sent one)
- \`next.body_video\` is non-empty (this email has video wording written for it)

A prospect gets exactly one video, so it goes with the first email that qualifies and every later email reverts to the standard body on its own once \`video_sent_at\` is stamped.

const useVideo = !!p.video_url && !p.video_sent_at && !!(next.body_video || '').trim();
const body = useVideo ? next.body_video : next.body;

If \`useVideo\` and the wording does not already contain a URL of its own, append the link after the sign-off, exactly:

Here's the link to it:
<the value of p.video_url>

Never paste the link into the middle of the wording, and never send a video body when \`p.video_url\` is empty — that would promise a video the prospect cannot watch.

2b. Name check: if the greeting names someone who does not match the name on file, skip and flag. A literal "[Name]" placeholder becomes "Hi there,".

2c. Compose in Gmail (proven pattern): click Compose, wait 1 second, click To, type the address, press Return, and screenshot to confirm the recipient chip committed. Set the subject via input[name="subjectbox"].value plus an input event. Set the body via div[aria-label="Message Body"].replaceChildren with one div per line (blank lines are a div containing a br). Never use innerHTML.

2d. Send, then verify the compose window is gone after ~2 seconds. Only then:
await window.bloom.setStage(EMAIL, 'Email ' + N);
setStage stamps today and bumps the touch count automatically. Verify the stage moved before the next prospect.

2e. If the video wording was the one that went out, record it in the same breath, before moving on:
await window.bloom.markVideoSent(EMAIL);
await window.bloom.setVideoSentEmail(EMAIL, SUBJECT, BODY_AS_SENT);
BODY_AS_SENT is the exact text that left Gmail, link line included. Both calls matter and neither is optional: \`markVideoSent\` is what stops the next email in the sequence sending a second video, and \`setVideoSentEmail\` is the only record of what the prospect actually received. Skipping the first sends the same prospect two videos; skipping the second leaves the app showing a video was sent with nothing to show for it.

Only stamp these after a confirmed send. A stamp on an email that failed to leave permanently marks the prospect as already videoed and they will never be sent one.

## Step 3. Report

Sent count with names and subjects, skips with reasons, confirmation every stage advanced. Say which sends used the video wording and which used the standard one, since that is the difference the app is measuring. If anything failed twice, stop and tell me instead of pushing through.

## Safety (non-negotiable)

- Email only. Never a DM, comment, or connection request.
- Send only from ${senderEmail}, only to prospects the app says are due.
- Never advance a stage before the send is confirmed.
- One prospect fully finished before the next.
- If my workspace looks like someone else's data, stop immediately.`;

  const websiteProspect = `---
name: bloom-website-prospect
description: "Validated-lead processing engine for ${brand}. WEBSITES ONLY — audits each Validated prospect's public website, never scans social profiles. Use whenever I say 'process the validated leads' or 'work the queue'. Reads Validated prospects (prescreened strong, with an email and a website) from my app at ${appUrl}, researches the site via a subagent, writes a personalized email sequence in my voice, stores it on the prospect, sends Email 1 from ${senderEmail} via Gmail, and advances the stage."
---

# Website Prospect Engine for ${brand}

Works the Validated queue of the cold-email pipeline: prospects that passed prescreen and have BOTH an email address and a website. (Prescreen-stage rows are not ready — they get a strong/skip verdict first.) For each one: research the website, write the email sequence, store it, send Email 1, advance the stage. Websites only — this skill never opens or scrapes a social profile.

My app is at ${appUrl}. I help ${who}. Send only from ${senderEmail}.

## Preflight

Stop and report if: the Chrome extension is not connected, ${senderEmail} is not the signed-in Gmail, or the app shows the access-code gate (ask me to log in). Then confirm the queue:

const q = window.bloom.getProspects().filter(p => p.stage === 'Validated' && p.email && p.domain);
Report the count before starting.

## Per prospect, in this order (one fully done before the next)

### 1. Research the website (subagent)

Spawn a subagent (keeps your context lean) that fetches the prospect's site with web_fetch — the homepage plus /about, /services, /contact, /book if they exist. It answers:
- What do they sell, to whom, in their own words?
- How does a new customer reach them — form, calendar, phone, DM? What happens after?
- One genuine, specific thing worth complimenting (not "nice website").
- One concrete gap ${brand} could fix, stated plainly.
- Verdict: STRONG (worth emailing) or SKIP (site dead, wrong fit, or already covered) with a one-line reason.

### 2. If SKIP

await window.bloom.setStage(EMAIL, 'Rejected');
await window.bloom.setRating(EMAIL, '✖️');
Prepend the reason to the prospect's info. Log it. Next prospect.

### 3. If STRONG: write the sequence

Write a 5-email sequence in MY voice. Read my voice samples first: settings.voiceSamples from fetch('/api/settings'). Rules: plain words, no exclamation marks, no metaphors, the compliment from the research in Email 1, one concrete observation per email, each follow-up shorter than the last, my sign-off. Email 1 is 75-100 words with zero links; follow-ups 30-50 words.

Store it:
await window.bloom.setEmailSequence(EMAIL, [
  { number: 1, day: 0, subject: '...', body: '...' },
  { number: 2, day: 3, subject: '...', body: '...' },
  { number: 3, day: 7, subject: '...', body: '...' },
  { number: 4, day: 14, subject: '...', body: '...' },
  { number: 5, day: 21, subject: '...', body: '...' }
]);
await window.bloom.setAuditNotes(EMAIL, 'the research summary');
Verify the sequence stored before continuing.

### 4. Send Email 1 via Gmail

Same compose pattern as the follow-up sweep: Compose → wait 1s → To → Return → verify the chip → subject via subjectbox → body via replaceChildren (never innerHTML) → Send → confirm the compose window closed.

### 5. Advance

await window.bloom.setStage(EMAIL, 'Email 1');
Verify it moved. The queue query naturally drops finished prospects.

## Safety (non-negotiable)

- Websites only. Never open, scan, or scrape a social media profile — that is what gets accounts flagged. If a prospect only has a socials link and no website, skip it.
- Email only, only from ${senderEmail}. Never advance before a confirmed send.
- The research verdict is final: a SKIP stays skipped even if the row was pre-rated strong.
- If anything fails twice in a row, stop and report.`;

  // The social sibling of the website engine. Research-deep DM drafting that
  // lives entirely on the safe side of the line: research happens on other
  // people's servers (logged-out fetches, Google, the Ad Library) — never in
  // the user's logged-in session — and the send is always human.
  const socialProspect = `---
name: bloom-social-prospect
description: "Social prospect engine for ${brand}. Researches each GREEN inbox lead's public footprint (their website, Google, the Facebook Ad Library — never a logged-in social session) and writes a personalized DM plan in my voice: one opener plus two follow-ups. Drafts only — I always send from my own account. Use whenever I say 'work the greens', 'draft DMs for the greens', or on a daily schedule. After I confirm sends, promotes those leads into my pipeline with a follow-up date."
---

# Social Prospect Engine for ${brand}

Turns green inbox leads into ready-to-send DM plans. Research runs deep but never inside a logged-in social session; writing is in my voice; sending is mine, always.

My app is at ${appUrl}. I help ${who}.

## Why the send stays human (non-negotiable)

Platforms flag what an ACCOUNT does: scripted messages, rapid profile visits, automation rhythms. So this skill only touches things that are not my account: logged-out public pages, Google, the Ad Library, my own app. I send each DM myself, from my own device, at human pace. Never offer to send. Never open a social profile while logged in.

## Preflight

Stop and report if the app does not load or shows the access-code gate (ask me to log in; never type my code).

## Step 1. The greens without a plan

const greens = ((await (await fetch('/api/leads?status=qualified')).json()).leads || [])
  .filter(l => l.verdict === 'green' && !(l.notes || '').includes('--- DM plan ---'));

If empty, report "Every green already has a plan" and stop. Cap 10 per run so quality stays high.

## Step 2. Research each lead (subagent, safe lane only)

Spawn a subagent per lead with the lead's post text, author name/handle, and URL. It may use ONLY:
- web_fetch on any website linked from the post or profile URL (logged-out)
- A Google search on the name/handle/business (logged-out)
- The Facebook Ad Library: https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&q=NAME — running ads is a strong buying signal
- The lead's own post text — the richest evidence of what they need

It may NOT log in anywhere, open a chat, or browse social feeds. If the public footprint is thin, it says so instead of inventing.

The subagent returns: who they are in one line, what they sell and to whom, one genuine specific compliment, the one gap ${brand} can fix, any buying signals (ads running, hiring posts, recent launch), and a confidence note for anything unverified.

## Step 3. Write the DM plan in my voice

Read my voice first: settings.voiceSamples via fetch('/api/settings'). Rules: plain words, no exclamation marks, no metaphors, warmth from specificity, CTAs as questions, each message shorter than the last. Never invent a detail the research did not verify.

- Touch 1 (opener): the genuine compliment + one observation + a light question. Short enough to read on a phone lock screen.
- Touch 2 (day 3): new value — a fresh observation or a tiny idea, not "just following up".
- Touch 3 (day 7): the direct-but-warm ask, with an easy out.

Append to the lead's notes (keep what is there):

await fetch('/api/leads/' + lead.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ notes: (lead.notes ? lead.notes + '\\n' : '') + '--- DM plan ---\\nWHY THEM: ...\\nTOUCH 1: ...\\nTOUCH 2 (day 3): ...\\nTOUCH 3 (day 7): ...' }) });

Verify each write landed before the next lead.

## Step 4. Present the batch

One block per lead: name, platform, the why-them line, and Touch 1 ready to copy. Then one ask: say 'sent' plus the names once the openers are out, and I will move them into your pipeline.

## Step 5. After I confirm 'sent NAME NAME', promote each named lead

const res = await fetch('/api/leads/' + lead.id + '/promote', { method: 'POST' });
const prospect = (await res.json()).prospect;
const today = new Date().toISOString().slice(0, 10);
const in3 = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
await fetch('/api/prospects/' + prospect.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ stage: 'DM 1', last_contact_date: today, next_action_date: in3 }) });

That puts them on the Due radar for Touch 2 in three days (the DM follow-up sweep picks them up from there). If I never confirm, promote nothing.

## Step 6. Report

Plans written (names + platforms), thin-footprint leads flagged, promotions made with their next due date, anything odd.

## Safety (non-negotiable)

- Never send a DM, comment, follow, or connection request
- Never open a social profile while logged in; research is logged-out fetches, Google, and the Ad Library only
- Never invent personalization details — unverified means unmentioned
- Never promote a lead before I confirm the send
- Cap 10 plans per run`;

  return [
    { id: 'sweep', name: 'Lead sweep', filename: 'bloom-lead-sweep', folder: 'bloom-lead-sweep', md: sweep,
      blurb: 'Social lane · Scout Bee. Searches two platforms daily and stocks your inbox. Read-only, never messages.' },
    { id: 'prescreen', name: 'Lead prescreen', filename: 'bloom-lead-prescreen', folder: 'bloom-lead-prescreen', md: prescreen,
      blurb: 'Social lane · Guard Bee. Scores every new lead green or red with reasons.' },
    { id: 'followup', name: 'DM follow-up sweep', filename: 'bloom-followup-sweep', folder: 'bloom-followup-sweep', md: followup,
      blurb: 'Social lane · The daily ritual. Drafts your due DMs. You press send — always.' },
    { id: 'social-prospect', name: 'Social prospect engine', filename: 'bloom-social-prospect', folder: 'bloom-social-prospect', md: socialProspect,
      blurb: 'Social lane · Researches each green lead (logged-out only) and writes a 3-touch DM plan in your voice. Sending stays yours.' },
    { id: 'email-followup', name: 'Email follow-up sweep', filename: 'bloom-email-followup', folder: 'bloom-email-followup', md: emailFollowup,
      blurb: 'Email lane · Sends each due prospect the next email of their stored sequence via Gmail. Country filter optional.' },
    { id: 'website-prospect', name: 'Website prospect engine', filename: 'bloom-website-prospect', folder: 'bloom-website-prospect', md: websiteProspect,
      blurb: 'Email lane · Audits each New prospect’s website, writes their sequence in your voice, sends Email 1. Websites only.' },
  ];
}
