// Default Workspace content (amendment A5): BloomBoard's scripts plus the
// Lead Engine offer's content banks. Seeded once when the library is empty;
// every block is editable afterward — these are starting points, not canon.

const QUESTIONNAIRE = `Quick questions so I can get your content right from week one.

1. In one or two sentences, what do you sell and who buys it?
2. What are your 3 best sellers or most-booked services?
3. Who is your dream customer? Age, location, what they care about.
4. What questions do customers ask you over and over?
5. Any topics, words, or angles you never want posted?
6. Who are 2 or 3 accounts in your space whose content you like?
7. What has worked before on your socials, even a little?
8. What hasn't worked or felt wrong?
9. Do you have photos and videos I can use, or do we need to plan a content day?
10. What does a win look like in 90 days? More DMs, more bookings, more foot traffic?`;

const DM_FIRST = `Hi [name], I was looking at [their page] and noticed you haven't posted since [month]. Your [product/service] photos are good, they're just not being seen. I help [niche] businesses keep their socials active and turning into actual customers. Want me to send over 2 or 3 quick ideas for your page? Free, no pitch.`;

const DM_FOLLOWUP_1 = `Hey [name], following up on my last message. Here's one quick idea either way: [one specific, concrete content idea for their business]. Happy to share the other two if useful.`;

const DM_FOLLOWUP_2 = `Last note from me, [name]. If keeping the page active is on the someday list, I get it. I'll leave you with this: [one stat or observation specific to their situation]. If you ever want a hand, I'm around.`;

const DM_REVIVAL = `Hi [name], checked your page again and [specific new observation]. Timing might be better now. Still happy to send those free ideas if you want them.`;

const WEEKLY_RHYTHM = `Monday: add 10 new leads and score them. Message every green.

Tuesday to Friday: open Today first thing. Clear overdue, then today's list. Log every touch so the app keeps your dates honest.

Friday: check leads coming due next week. Move dead conversations out so your pipeline stays real.

Rule of thumb: a lead isn't lost until they say no or ignore 3 touches.`;

const GREEN_SIGNALS = `A lead is GREEN when the post shows real buying intent:

- Asking for help with the exact problem you solve
- Describing the problem in their own words
- Hiring right now ("looking for", "need someone who")
- Asking for rates or availability

Green means message them today, referencing their own words.`;

const RED_FLAGS = `A lead is RED when the post shows it will waste your time:

- Another provider advertising their own services
- Scam patterns: vague "opportunity", pay-to-apply, too-good rates
- Clout-bait: engagement farming, no real request
- The post is older than 3 days

Red means skip without guilt. The list refills tomorrow.`;

const PLATFORM_MAP = `Where the leads are, and what to search on each:

Facebook + Groups: niche groups, "recommendations?" posts, local business groups
Threads: complaint posts and "anyone know someone who..." asks
Instagram: comments under niche hashtags, story polls, competitor followers
LinkedIn: "we're hiring" posts that should be contractor roles, founder complaints
Upwork: fresh posts in your category, under 5 proposals
OnlineJobs.ph: PH-focused roles, filter for your skill
X: advanced search on problem phrases + "recommendations"
TikTok: comments on niche creator videos asking for help
Reddit: niche subreddits, weekly "who's hiring" threads

Work 2 or 3 platforms well instead of all 9 badly.`;

const PROPOSAL_TEMPLATE = `[Client name] — Proposal

The problem in one line: [their problem, in their words]

Tier 1 — Foundation: [core deliverable]. [price]/month
Tier 2 — Growth: everything in Foundation plus [expansion]. [price]/month
Tier 3 — Partner: everything in Growth plus [premium access/strategy]. [price]/month

Scope lock: this covers exactly what is listed above. New requests are welcome and quoted separately, so the work you're paying for never gets crowded out.

Start date: [date]. First invoice covers [period]. Cancel any month, 14 days notice.`;

const START_PLAN = `Day 1: fill in your offer, audience, and green/red rules in Settings.
Day 2: pick your 2 or 3 platforms from the platform map. Set up saved searches.
Day 3: add your first 10 leads to the Inbox. Score them.
Day 4: message every green using the first-touch script. Log each one.
Day 5: add 10 more leads. Send follow-up 1 to anyone who read but didn't reply.
Day 6: check Today. Clear overdue. Move dead ones out.
Day 7: review the week: replies, calls booked, what wording pulled responses. Adjust the scripts.`;

export const DEFAULT_LIBRARY = [
  {
    title: 'Onboarding questionnaire',
    note: 'Send this to every new client before you post anything.',
    items: [{ title: 'Client questionnaire', body: QUESTIONNAIRE }],
  },
  {
    title: 'Outreach scripts',
    note: 'Fill in the brackets before you send. Specific beats clever.',
    items: [
      { title: 'First touch', body: DM_FIRST },
      { title: 'Follow-up 1 (3 to 4 days later)', body: DM_FOLLOWUP_1 },
      { title: 'Follow-up 2 (a week later)', body: DM_FOLLOWUP_2 },
      { title: 'Revival (30+ days later)', body: DM_REVIVAL },
    ],
  },
  {
    title: 'Filter rules',
    note: 'The green and red signals behind the Inbox scoring.',
    items: [
      { title: 'Green signals', body: GREEN_SIGNALS },
      { title: 'Red flags', body: RED_FLAGS },
    ],
  },
  {
    title: 'Platform map',
    note: 'Where to hunt and what to type in the search box.',
    items: [{ title: 'The nine platforms', body: PLATFORM_MAP }],
  },
  {
    title: 'Proposal template',
    note: 'Three tiers with scope-lock language. Edit prices per client.',
    items: [{ title: '3-tier proposal', body: PROPOSAL_TEMPLATE }],
  },
  {
    title: 'Playbooks',
    note: 'How to run the tool, day by day.',
    items: [
      { title: '7-day start plan', body: START_PLAN },
      { title: 'Weekly rhythm', body: WEEKLY_RHYTHM },
    ],
  },
];

// ── Prompts library (category: 'prompts') ────────────────────────────────
// The three raw prompts behind the find/filter/write loop. Fill the
// bracketed slots from your Settings profile before pasting into ChatGPT
// or Claude. Every prompt is editable — tune the wording to your voice.

const BUYER_FINDER = `You generate search phrases that find people ACTIVELY trying to hire for this service. Buyers only, never providers.

Service: [YOUR OFFER, one line]
Ideal buyer: [YOUR AUDIENCE, one line]
Region and language notes: [e.g. "US small businesses, English" or "PH + US, English, some Taglish"]

Output, grouped by platform:

FACEBOOK GROUPS AND THREADS (conversational asks): 8 phrases people post when asking for help or recommendations. Full sentences and fragments, the way real people type, typos welcome.
X AND REDDIT (search-box queries): 8 short phrases, 2-5 words, that surface complaint and hiring posts.
UPWORK AND JOB BOARDS (listing language): 5 phrases employers put in titles when they should be hiring a freelancer for this.

Then two more lists:
EXCLUDE WORDS: 6-10 words that mean the post is NOT a buyer (provider language, MLM bait, job-seeker language). I will use these to skip fast.
FALSE FRIENDS: 3 example posts that LOOK like buyers but are not, each with one line on the tell.

Rules: buyer language only, no hashtags, no marketing speak, match the region notes above.`;

const QUALIFIER = `You are my lead qualifier. I paste a social media post, you judge it against my rules.

My service: [YOUR OFFER, one line]
GREEN signals: asking for help with this exact problem, describing the problem in their own words, hiring now, asking for rates
RED flags: another provider advertising, scam or MLM patterns, engagement bait, job seeker, post older than 3 days
[YOUR EXTRA RULES, if any]

Judging rules:
- One green signal is not enough if a red flag is present. Red flags win.
- When genuinely unsure, verdict is red with confidence low. My time is the scarce resource.

Reply in EXACTLY this format:
VERDICT: green or red
CONFIDENCE: high or low
REASONS: which of my rules fired, one per line
FIRST LINE (green only): one opening sentence for my DM that quotes or references their exact words. No emojis, no "I noticed", under 20 words.`;

const MESSAGE_WRITER = `Write a DM that sounds like ME, reacting to this person's exact post.

Learn my voice from these two real messages I sent (do not copy them, copy HOW they sound):
1. [PASTE A REAL DM YOU SENT]
2. [PASTE ANOTHER ONE]

My service: [YOUR OFFER, one line]
Platform: [WHERE THIS POST LIVES. Match its norms: LinkedIn slightly more formal, IG and Threads casual and short, Upwork structured]
Their post:
"""
[PASTE THE POST]
"""

Rules:
- First line reacts to THEIR words, proving I read it. Not a compliment sandwich.
- Under 80 words total. One question at the end, low pressure, no link, no pitch.
- Banned: "I hope this finds you well", "I noticed", "I came across", "As a [title]", "game-changer", "no worries if not", any emoji unless my samples use them.
- Do not mention how recently they posted.

Give me 2 versions: SAFE (matches my samples exactly) and BOLDER (one notch more direct, same length).`;

export const DEFAULT_PROMPTS = [
  {
    title: 'Buyer finder',
    note: 'Generates the intent phrases you search on each platform.',
    items: [{
      title: 'Buyer-finder prompt',
      body: BUYER_FINDER,
      notes: 'Run once per service, per region. Save the output into a page. The EXCLUDE WORDS list is the half people skip and the half that saves the most time.',
    }],
  },
  {
    title: 'Qualifier',
    note: 'Paste a post, get a green/red verdict with reasons.',
    items: [{
      title: 'Qualifier prompt',
      body: QUALIFIER,
      notes: 'Heads up: the Inbox already scores leads automatically with your saved rules. This copy is for scoring outside the app, or for tuning the wording.',
    }],
  },
  {
    title: 'Message writer',
    note: 'Turns a green post into a DM that sounds like you.',
    items: [{
      title: 'Message-writer prompt',
      body: MESSAGE_WRITER,
      notes: 'The two pasted samples ARE the prompt. Pick two DMs that got replies, not your two most polished. Refresh them monthly as your voice drifts.',
    }],
  },
];

// ── Handsoff library (category: 'handsoff') ──────────────────────────────
// Prompts written for AGENTS (Claude Cowork, Claude in Chrome, ChatGPT
// agent mode), not chat copy-paste. Each block's notes say which model and
// subscription tier the task actually needs. The goal: Ellen-grade
// automation with a human still pressing send.

const AGENT_LEAD_SWEEP = `You are my lead-finding agent. Read-only: never like, follow, comment, or message. Report at the end.

My service: [YOUR OFFER]
My intent phrases: [PASTE 5-10 FROM THE INBOX FIND PANEL]
Platforms this run (pick 2): [Facebook / Threads / X / Reddit]

Search shortcuts (put the phrase where PHRASE is):
- Facebook posts: facebook.com/search/posts/?q=PHRASE
- Threads: threads.net/search?q=PHRASE
- X newest: x.com/search?q=PHRASE&f=live
- Reddit newest: reddit.com/search/?q=PHRASE&sort=new

Process:
1. Work through each phrase on both platforms, newest first.
2. Keep posts from the last 3 days where a real person asks for help, describes the problem, is hiring, or asks rates.
3. Skip providers advertising, engagement bait, job seekers, anything older than 3 days.
4. Deduplicate: if the same post or author appears under two phrases, keep it once.
5. Stop conditions: stop at 12 keepers, or after 20 minutes, whichever comes first.

Output each keeper in EXACTLY this block format so I can paste it into my inbox form field by field:
---
Platform:
Post link:
Their name:
Profile / handle:
The post (their exact words):
Why green (one line):
---
End with one line: how many posts you scanned vs kept.`;

const AGENT_AD_QUALIFIER = `You are my prospect qualifier. Given a business name or Facebook page link, decide if they're a PRIME prospect using the ads-without-organic signal.

The business: [NAME OR PAGE LINK]

Steps:
1. Open the Facebook Ad Library (facebook.com/ads/library), country: their country or ALL, search the business name.
2. Note: are they running active ads? How many? Since when?
3. Open their Facebook page and Instagram if linked. Note the last organic post date, follower count, and typical likes/comments per post (big following + tiny engagement = weak organic).
4. Verdict:
   - PRIME: running ads while organic is dead or weak (they're paying for reach they could get organically — my exact pitch)
   - WARM: ads and decent organic, or no ads but active page with weak content
   - SKIP: healthy on both, or the page looks closed
Output: verdict, ad status (count + since when), last organic post date, one sentence I can use as my DM opener referencing what you saw.`;

const AGENT_DM_BATCH = `Draft DMs for this batch of green leads, one per lead, in MY voice.

My voice: [2-3 sentences on how you write]
My service: [YOUR OFFER]

Leads (one per line: name | platform | their post text):
[PASTE UP TO 10]

Rules per DM: react to their exact words in line one, under 80 words, end with a low-pressure question, no links, no templates. Output: name, then the DM, then a one-line bolder variant.`;

const AGENT_WEEK_REVIEW = `You are my pipeline analyst. I am pasting my prospect export (CSV). IMPORTANT: only compute what these columns actually support. If a metric is not derivable from the data, say "not in the data" instead of estimating. Never invent numbers.

[PASTE THE CSV FROM PROSPECTS -> EXPORT]

From the columns available (stage, rating, replied, reply_type, last_contact_date, emails_sent, country):
1. Pipeline shape: count per stage. Which stage holds the most stuck prospects (old last_contact_date, not replied)?
2. Reply picture: how many replied, split by reply_type. Response rate = replied divided by prospects with emails_sent above zero.
3. The 5 most neglected: oldest last_contact_date among active stages (not Finished, Rejected, Lost, or Client). Names please.
4. Three specific actions for next week that reference actual rows (names and stages), not generic advice.`;

const AGENT_ONBOARDING_PACK = `Build a client onboarding pack from these questionnaire answers.

Client answers:
[PASTE THE FILLED QUESTIONNAIRE]

Output:
1. Three content pillars with one-line rationale each.
2. Twelve post ideas mapped to pillars (hook + format).
3. A 2-week posting calendar (day, pillar, idea, format).
4. A do/don't list from their "never post" answers.
Keep everything in their niche's plain language, no marketing jargon.`;

export const DEFAULT_HANDSOFF = [
  {
    title: 'Find: daily lead sweep',
    note: 'An agent browses your phrase searches and returns a green-lead table.',
    items: [{
      title: 'Lead sweep agent prompt',
      body: AGENT_LEAD_SWEEP,
      notes: 'Needs an AI that can browse: Claude (Cowork or the Chrome extension) on Pro or Max, or ChatGPT agent mode on Plus. Sonnet-class models are fine. Keep it read-only and 2 platforms per run so activity looks human.',
    }],
  },
  {
    title: 'Qualify: ad-spend check',
    note: 'Is this page paying for ads while their organic is dead? Prime prospect.',
    items: [{
      title: 'Ad Library qualifier prompt',
      body: AGENT_AD_QUALIFIER,
      notes: 'The Facebook Ad Library is public, no login needed, so any browsing-capable AI works: Claude with browser access (Pro/Max) or ChatGPT agent mode (Plus). For one-off checks, the Ad Library link on each inbox lead does it by hand in 30 seconds.',
    }],
  },
  {
    title: 'Write: DM batch drafter',
    note: 'Ten green leads in, ten DMs in your voice out.',
    items: [{
      title: 'DM batch prompt',
      body: AGENT_DM_BATCH,
      notes: 'No browsing needed: works on free ChatGPT or free Claude. Use a stronger model (Claude Sonnet or better) when your voice is distinctive, since cheap models flatten voice.',
    }],
  },
  {
    title: 'Review: weekly pipeline analyst',
    note: 'Paste your CSV export, get the leaks and next actions.',
    items: [{
      title: 'Weekly review prompt',
      body: AGENT_WEEK_REVIEW,
      notes: 'Free tiers handle this. Export the CSV from Prospects (download icon) first. Run it every Friday and paste the three actions into a page.',
    }],
  },
  {
    title: 'Deliver: onboarding pack builder',
    note: 'Questionnaire answers in, content plan out.',
    items: [{
      title: 'Onboarding pack prompt',
      body: AGENT_ONBOARDING_PACK,
      notes: 'Free tiers work; paid models give noticeably better post ideas. Paste the output into a page and prune before the client sees it — the human pass is what they pay you for.',
    }],
  },
];

// ── Deep-work prompts (appended groups, own wording, app-aware) ─────────

const NICHE_CHECK = `Before building any lead engine, answer these three honestly:

1. Can you name 20 real people or businesses, right now, who would buy this within a month?
2. Is there a visible place online where they gather? A group, a subreddit, a hashtag, a job board.
3. Can you write their pain the way THEY would type it at 11pm, not the way you would pitch it?

Mostly yes: build. Mostly no: your niche is too broad to search for, and a broad niche builds an engine that finds nobody in particular.

If you got a "no", paste this into your AI:

Act as a positioning strategist. My service: [WHAT YOU SELL]. Ask me who exactly buys this, where they gather online, and what pain they would type in their own words. Then give me 3 tighter niche options where I could realistically name 20 buyers this month, each with the one place online they gather.`;

const POSITIONING_BUILDER = `Write ONE positioning sentence with this exact skeleton:

I help [WHO, specific] get [RESULT, concrete] through [METHOD, yours].

Example shape: "I help wellness coaches get consistent, booked-out clients through done-for-you content and DM follow-up."

Test: if your sentence could describe five different businesses, tighten WHO or RESULT until it can't.

Then paste this into your AI:

Act as a positioning strategist. Here is my sentence: [YOUR SENTENCE]. List the 3 buyer segments who need this most urgently right now, ranked. For the top segment, rewrite my sentence to target them specifically, even if it narrows my audience. Save the winner into Settings as your positioning sentence — every prompt this app generates uses it.`;

const QUALITY_DIP_DEBUG = `Run this when lead quality dips, instead of blaming the tool.

Act as a positioning strategist. Here are my last 3 best clients and what they had in common when they found me: [DESCRIBE EACH IN ONE LINE]. Here are 3 recent leads that went nowhere: [ONE LINE EACH]. Tell me: what do the good ones share that the dead ones lack? Then rewrite my positioning sentence to target that pattern specifically: [CURRENT SENTENCE]. Output the narrowed sentence and the 3 search phrases it implies.`;

const GONE_QUIET = `Most replies come on message 2 or 3, not message 1. When a lead goes quiet:

Act as a follow-up strategist. This lead went quiet after my first message. My first message: [PASTE IT]. Their original post: [PASTE IT]. Days since: [N]. Write a follow-up that adds one NEW piece of value (an idea, an observation, a resource), gently acknowledges time passing without guilt-tripping, and ends with an easier question than my first message asked. Under 60 words. No "just checking in", no "bumping this".`;

const PRICE_QUESTION = `The price question in a DM is where most people underquote or overexplain. Hold the number.

Act as a sales coach helping me answer a price question in a DM without sounding defensive, apologetic, or evasive. My service and price: [SERVICE + PRICE]. Their message: [PASTE IT]. Write a reply that states the price plainly in the first sentence, ties it to the one outcome they care about (from their post: [DETAIL]), and ends by moving to the next step, not defending the number. Do not apologize for the price. Do not offer a discount unprompted. Under 70 words.`;

const BATCH_PERSONALIZE = `One-by-one DMs don't scale. Templates that read like templates kill replies. The middle path:

Act as a copywriter who personalizes outreach at volume without it reading like a mail merge. Here is my DM skeleton (structure and length stay fixed): [PASTE YOUR BEST DM]. Here are 5 leads, each with one specific detail from their post:
1. [NAME — DETAIL]
2. [NAME — DETAIL]
3. [NAME — DETAIL]
4. [NAME — DETAIL]
5. [NAME — DETAIL]
Write 5 versions keeping the skeleton, swapping in a genuinely specific opening line built from each detail. The opening line must prove I read their post.`;

const CADENCE_PLANNER = `Automate what already works, not what you're still guessing at. Don't automate a channel until you've closed a client or two on it by hand.

Act as an ops consultant reviewing my lead engine cadence. My time budget: [N minutes per day]. My platforms: [LIST]. My current numbers: [X leads added, Y DMs sent, Z replies last week]. Given that budget, tell me: how many phrases I should search daily, how many follow-ups I can realistically send, and the ONE task I should automate first versus the ones to keep manual. Be specific to my numbers, not generic.`;

const CONTENT_HOOKS = `Outreach pulls one lead at a time. Content pulls them to you while you sleep.

Act as a content strategist for service providers. My positioning: [YOUR SENTENCE FROM SETTINGS]. My buyers' three loudest pains, in their words: [FROM YOUR PHRASE RESEARCH]. Give me: 10 hooks (first lines that stop the scroll, one pain each, no clickbait), then 5 full post outlines (hook, 3 beats, soft CTA that invites a DM, not a link). Match the platform: [WHERE YOU POST]. My voice samples: [PASTE 2 REAL POSTS OR DMS].`;

export const DEFAULT_PROMPTS_EXTRA = [
  {
    title: 'Niche check',
    note: 'Run this before anything else. A broad niche builds an engine that finds nobody.',
    items: [{
      title: 'Three honest questions + narrowing prompt',
      body: NICHE_CHECK,
      notes: 'If you cannot name 20 buyers, the fix is the niche, not the tool.',
    }],
  },
  {
    title: 'Positioning',
    note: 'One sentence powers every prompt this app generates. Sharpen it here.',
    items: [
      {
        title: 'Positioning sentence builder',
        body: POSITIONING_BUILDER,
        notes: 'Save the result into Settings → Positioning sentence. Everything downstream sharpens with it.',
      },
      {
        title: 'Lead-quality dip debugger',
        body: QUALITY_DIP_DEBUG,
        notes: 'Run monthly, or whenever greens stop converting. The pattern is usually in WHO, not in the wording.',
      },
    ],
  },
  {
    title: 'Follow-ups and objections',
    note: 'Most replies come on message 2 or 3. These keep the thread alive.',
    items: [
      {
        title: 'Lead went quiet',
        body: GONE_QUIET,
        notes: 'Value first, guilt never. If they ignore three value-adds, move them out and keep your pipeline honest.',
      },
      {
        title: 'The price question',
        body: PRICE_QUESTION,
        notes: 'State the number in sentence one. Dodging reads as doubt, and doubt kills deals faster than price.',
      },
    ],
  },
  {
    title: 'Scaling up',
    note: 'For when one-by-one stops fitting in your day.',
    items: [
      {
        title: 'Batch personalization',
        body: BATCH_PERSONALIZE,
        notes: 'The skeleton comes from your best-performing DM, not your prettiest one.',
      },
      {
        title: 'Cadence planner',
        body: CADENCE_PLANNER,
        notes: 'Rerun when your time budget changes. Automating a broken step just breaks faster.',
      },
    ],
  },
  {
    title: 'Content engine',
    note: 'Posts that pull buyers to you between outreach sessions.',
    items: [{
      title: 'Hooks and post outlines',
      body: CONTENT_HOOKS,
      notes: 'Hooks come from THEIR pain words, not your service description. Reuse your phrase research here.',
    }],
  },
];

// ─── Resources: instructions and tips (category 'resources') ────────────
// The reference shelf: how agents talk to the app, how to source leads
// without getting banned, and how to put the engine on a schedule.

const HOOKS_INTRO = `The Agent API is the doorway agents use to read and write this app. There are two doors.

Door 1: window.bloom. When the app is open in a browser tab, a JavaScript API is attached to the page. Any agent that can run code in your browser (Claude with the Chrome extension, Cowork with browser access) can call it from the console. This is the easiest door and it uses the exact same write path as the UI, so the table updates live.

Door 2: the HTTP endpoints. Every screen in this app is backed by a plain JSON API on the same domain. Any tool that can make web requests can use it.

How to use this page: when you write a prompt or a skill for an agent, paste the two blocks below into it. That is the whole integration. The agent now knows where to read leads, write verdicts, and log follow-ups, and you never copy data by hand again.`;

const HOOKS_WINDOW = `Open the app in a tab, then run these in the page console. Reads are instant, writes return promises, so await them.

window.bloom.getProspects() gives every prospect row.
window.bloom.getDue() gives prospects due for a follow-up.
window.bloom.getStats() gives pipeline counts.
window.bloom.findByEmail(email) gives one prospect.
await window.bloom.addProspect({ name, business, email, domain }) creates one.
await window.bloom.setStage(email, stage) moves the pipeline and stamps the contact date.
await window.bloom.markReplied(email) flags a reply.
await window.bloom.setReplyType(email, type) records what kind of reply.
await window.bloom.setNextActionDate(email, 'YYYY-MM-DD') schedules the next touch.
await window.bloom.setLastContact(email, 'YYYY-MM-DD') stamps a touch.
await window.bloom.setInfo(email, text) saves the business snapshot.
await window.bloom.setAuditNotes(email, text) saves research notes.
await window.bloom.refresh() re-pulls everything from the server.

Two rules for agents. Always await writes, an unawaited write can silently do nothing. And verify after writing: read the row back and confirm the field actually changed before moving on.`;

const HOOKS_HTTP = `All endpoints live on the app domain and speak JSON. From the app tab, fetch('/api/...') works as is.

GET /api/leads lists inbox leads. Filter with ?status=new or ?verdict=green.
POST /api/leads adds a lead. Body: { platform, post_url, post_text, author_name, author_handle, notes }. Platform must be one of Facebook, Threads, Instagram, LinkedIn, Upwork, Reddit, X, Other.
PUT /api/leads/ID updates a lead. Accepts verdict ('green' or 'red'), verdict_reasons (array of strings), status ('new', 'qualified', 'skipped'), notes, and the post fields.
GET /api/prospects lists the pipeline. PUT /api/prospects/ID updates one.
GET /api/settings gives the engine profile: your offer, positioning, green and red rules, intent phrases, platforms.
POST /api/ai runs an AI employee. Body: { task } where task is 'score' (with leadId), 'draft' (with leadId), 'phrases', or 'analyze'. Needs your API key saved in Settings.
GET /api/pages lists workspace pages, POST /api/pages creates one (title, emoji, body as HTML).

Example, add a lead from the console of the app tab:

await fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform: 'Reddit', post_url: 'https://...', post_text: 'the ask, pasted', author_name: 'Jane', notes: 'found by sweep' }) })`;

const HOOKS_RULES = `Ground rules for any agent touching this app. Put these in every prompt.

1. Read before you write. Pull the current row first so you never overwrite fresh data with stale data.
2. Verify every write. Read the row back and confirm the change landed. If it did not, report it, do not retry blindly.
3. Never invent data. No made-up names, links, or numbers. If a field is unknown, leave it empty and say so.
4. Never send anything. Drafts go into the app or the report. A human presses send.
5. Stop conditions beat guesses. If the app will not load, the tab is wrong, or a write keeps failing, stop and report exactly what happened.
6. Dedupe by URL. Before adding a lead, check the existing list for the same post_url. Skip duplicates silently and count them in the report.`;

const SCRAPE_WHAT = `Scraping just means collecting public information with a tool instead of your eyes. Reading 30 Reddit posts and copying the good ones is scraping done by hand. Having an agent do the same reading is scraping done faster. The line that matters is not the word, it is how you collect and what you do with it.

The useful frame: platforms sell attention. They fight anything that extracts value at scale without giving them activity back. So the safe path always looks like a fast human, never like a bot army.`;

const SCRAPE_SAFE = `The safe lane, in order of safety:

1. Platform search pages, logged out. Reddit search, X search, YouTube search. Public, no account at risk.
2. Google with site: filters. site:reddit.com plus your intent phrase finds posts without touching the platform at all. Zero risk, surprisingly good.
3. The Facebook Ad Library. Fully public and searchable by page name. This is how you check if a business pays for ads while their organic sits dead, which is a prime signal for your pitch.
4. RSS and public APIs where they exist. Reddit has JSON built in: add .json to almost any Reddit URL.
5. An agent browsing on your behalf at human speed, reading and collecting into the app. A few dozen page views per day looks like a person, because it effectively is one.

Keep every sweep small. Two platforms per run, one or two dozen leads per day. You only need 10 greens a week to fill a client book.`;

const SCRAPE_RISKY = `The risky lane, where accounts get banned:

1. Logged-in automation on Facebook, Instagram, or LinkedIn. These platforms detect scripted behavior on accounts and ban the account, not the tool. Your personal profile is your storefront, never gamble it.
2. Mass DMs or connection requests. Even hand-sent, going over roughly 20 cold DMs a day on one account trips spam filters. Sending through a tool trips them faster.
3. Headless scrapers hammering pages. Hundreds of requests per hour from one IP gets blocked and can poison the whole approach.
4. Buying lead lists. Stale, wrong, and everyone else bought the same list. Intent phrases beat lists because you catch people mid-problem.

The rule: collect in public, act in person. Let agents gather and score. You, a human, send every message from your real account at human pace.`;

const COWORK_WHAT = `A .skill file is a set of instructions Claude can follow on a schedule, like a runbook for an employee. You write the steps once, upload the file to Claude (Cowork), and then either trigger it by name or schedule it to run daily.

Install: in Claude, attach or upload the .skill file, or place it in your skills folder if you run Claude Code. Once installed, saying the trigger phrase in the skill description starts the run.

Schedule: in Cowork, create a scheduled task and tell it which skill to run. A daily morning run before you start work means you open the app to a full inbox and a scored pipeline, not a to-do list.`;

const COWORK_SKILLS = `The three Bloom skills, and what each one does to this app:

bloom-lead-sweep, the Scout Bee on a schedule. Reads your intent phrases from Settings, searches two platforms in the safe lane, collects fresh asks, dedupes against your inbox by URL, and adds new leads through the Agent API. You wake up to a stocked inbox.

bloom-lead-prescreen, the Guard Bee on a schedule. Reads every unscored inbox lead, checks the author is a real, live business (and for Facebook pages, checks the Ad Library), applies your green and red rules, and writes verdicts with reasons back to the app. Greens wait for you, reds are filed away with an explanation.

bloom-followup-sweep, the daily ritual. Reads your due and overdue follow-ups, drafts a DM for each in your voice using your own templates, and hands you the list. You send each one from your real account, say sent, and the skill stamps the dates so Today stays honest.

Run order matters: sweep first, prescreen second, follow-ups whenever you sit down to send. All three report what they did and stop loudly instead of guessing.`;

const COWORK_MODELS = `What you need, honestly:

Claude Pro or Max with Cowork for scheduled runs, or the Claude Chrome extension for runs you trigger by hand. Sonnet-class models handle all three skills fine, the work is reading, judging, and writing short drafts. Save Opus-class models for strategy sessions, not sweeps.

Usage sense: a daily sweep plus prescreen is a few minutes of agent time. On a subscription it is included. If you later wire the in-app AI Hive with your own API key, each run uses only a little of your key's usage.

Safety that is built into all three skills: they never send messages, never log into platforms as you, never touch more than two platforms per sweep, and they stop and report instead of guessing when anything looks off.`;

// Each guide is its own sidebar tab under Resources, so each is its own
// seed category: guide-agents, guide-sourcing, guide-automation.

export const DEFAULT_GUIDE_AGENTS = [
  {
    title: 'The agent doorway',
    note: 'How any AI agent reads and writes this app. Paste these blocks into your agent prompts.',
    items: [
      { title: 'What the Agent API is', body: HOOKS_INTRO, notes: 'The short version: two doors, window.bloom in the app tab and /api over HTTP. Give agents both blocks below and they are integrated.' },
      { title: 'window.bloom, the in-tab API', body: HOOKS_WINDOW, notes: 'Best door for Chrome-extension and Cowork browser runs. Same write path as the UI, so the screen updates live while the agent works.' },
      { title: 'The HTTP endpoints', body: HOOKS_HTTP, notes: 'Best door for anything that can make web requests. From the app tab, relative fetch("/api/...") just works.' },
      { title: 'Ground rules for agents', body: HOOKS_RULES, notes: 'Paste this block verbatim into every agent prompt. Rule 2 (verify every write) has saved more pipelines than any other line.' },
    ],
  },
];

export const DEFAULT_GUIDE_SOURCING = [
  {
    title: 'Scraping and sourcing, done safely',
    note: 'How to collect leads at scale without risking the accounts you sell with.',
    items: [
      { title: 'What scraping actually is', body: SCRAPE_WHAT, notes: 'Demystifies the word. Collecting public posts is normal research, the risk lives in HOW you collect.' },
      { title: 'The safe lane', body: SCRAPE_SAFE, notes: 'Logged-out search, site: filters, the Ad Library, and Reddit .json. Everything the Bloom skills use lives in this lane.' },
      { title: 'The risky lane', body: SCRAPE_RISKY, notes: 'The short version: never automate a logged-in account, never mass DM. Collect in public, act in person.' },
    ],
  },
];

const PROMO_BLOOMHOOKS = `BloomHooks is a private content-research studio for short-form creators, live at bloomhooks.com.

It watches the Instagram and YouTube accounts you choose and finds their outliers: videos performing 5x, 50x, even 300x above that channel's normal views, which is the surest signal an idea hit. For any outlier it pulls the transcript (it even transcribes the spoken audio in Reels), and AI breaks down why it worked: the hook, the storytelling format, the belief it challenges, and three ways to remake it for your own niche. Every hook gets templated into a growing, searchable vault, and one click turns any idea into a ready-to-film script, written in your voice, for your audience, ending in your offer.

In one line: it finds the videos that broke out, tells you why, and turns them into your next script.

If you manage content for clients, this is where your content calendar ideas come from. Password protected, no setup. Open the site, log in, research.`;

const PROMO_BLOOMWIRED = `Bloomwired (bloomwired.io) builds booking and follow-up systems for small businesses. In plain words: when a business gets inquiries but loses track of them, Bloomwired sets up the forms, calendars, automations, and reminders so every inquiry gets answered and followed up.

When to send a client there: they need a GHL build or cleanup, online booking, missed-call text back, review automation, or a funnel. That work is out of scope for a social media manager, and handing it to a builder you trust makes you look good.

Leads That Bloom, the app you are in right now, is built by Bloomwired.`;

export const DEFAULT_GUIDE_AUTOMATION = [
  {
    title: 'Cowork skills: the engine on a schedule',
    note: 'Install the three Bloom .skill files and the daily loop runs itself.',
    items: [
      { title: 'What a .skill file is and how to install it', body: COWORK_WHAT, notes: 'One-time setup, about five minutes. After that the trigger phrase or the schedule does everything.' },
      { title: 'The three Bloom skills', body: COWORK_SKILLS, notes: 'Sweep stocks the inbox, prescreen scores it, follow-up drafts your daily sends. Run in that order.' },
      { title: 'Models, cost, and safety', body: COWORK_MODELS, notes: 'Sonnet-class is enough for all three. The skills never send anything, humans press send.' },
    ],
  },
  {
    title: 'More from Bloomwired',
    note: 'The studio behind this app, and the sister tool for the content side.',
    items: [
      { title: 'BloomHooks: your next script, found for you 🪝', body: PROMO_BLOOMHOOKS, notes: 'bloomhooks.com. Made for the content half of your job the way this app is made for the leads half.' },
      { title: 'Bloomwired: automations, booking, GHL', body: PROMO_BLOOMWIRED, notes: 'bloomwired.io. Where to point a client whose problem is bigger than social media.' },
    ],
  },
];
