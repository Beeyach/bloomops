// Leads That Bloom · lead-engine prompt assembly + result parsing.
// Pure module (no React, no DB) shared by the API routes and the UI.
// The copy-paste workflow builds prompts here; a future built-in AI route
// imports the same builder and changes only the transport.

import { SEND_DEFAULTS } from './send-policy.mjs';

export const LEAD_PLATFORMS = [
  'Facebook',
  'Threads',
  'Instagram',
  'LinkedIn',
  'Upwork',
  'Reddit',
  'X',
  'Other',
];

export const LEAD_STATUSES = ['new', 'qualified', 'skipped', 'promoted'];
export const LEAD_VERDICTS = ['green', 'red'];

export const DEFAULT_ENGINE_SETTINGS = {
  // Sending, and every one of these is off or conservative by default. A
  // workspace that upgrades and reads none of it keeps behaving exactly as it
  // did yesterday, which is the only acceptable default for a feature that
  // emails strangers. See lib/send-policy.mjs for what each one guards.
  // Spread, not copied. This block used to restate every send default as a
  // literal, which is a second send policy waiting to drift from the first.
  // lib/send-policy.mjs owns them; this template just carries them.
  ...SEND_DEFAULTS,
  // Who the workspace is. Every AI prompt that has to name somebody reads
  // these two, and they used to be hardcoded inside the prompt modules: nine
  // of them opened by naming Ary and describing her offer. That worked while
  // there was one workspace and made the offer un-editable in the place it
  // was actually written down.
  //
  // Blank is a supported state. The prompts read "this workspace" rather than
  // inventing a name, which is better than a placeholder reaching a real email.
  operatorName: '',
  businessName: '',
  offer: '',
  audience: '',
  // One sentence: who you help + the result + the method. The sharper this
  // is, the sharper every generated prompt gets.
  positioning: '',
  // 3-5 real messages you actually sent that got replies. Voice is
  // patterns, not vocabulary — these teach the AI yours.
  voiceSamples: [],
  // The hive's credentials: your own key, your own cost. Anthropic
  // (sk-ant-...) or OpenAI keys are auto-detected by prefix.
  aiKey: '',
  aiModel: 'claude-sonnet-5',
  // Apify API token for server-side lead scraping. Apify's servers do the
  // scraping, so this never touches your own social accounts.
  apifyToken: '',
  // Named prompt projects: one per client or niche. Each carries the
  // fill-ins that personalize the Chat prompts when copied.
  promptProjects: [],
  // The workspace 5-email template (see lib/sequence-template.mjs).
  // Applied per prospect from the sequence modal; editing it later never
  // rewrites sequences already stored on rows.
  sequenceTemplate: [],
  // Stages this workspace doesn't use, hidden from the stage dropdown.
  // The stage itself still exists and still works — a row already sitting
  // on a hidden stage keeps its color, its label and its follow-up rules.
  // This only shortens the menu you pick from.
  hiddenStages: [],
  greenRules: [
    'asking for help or recommendations',
    'describing a problem I solve',
    'hiring now',
    'asking for rates',
  ],
  redRules: [
    'another provider advertising their services',
    'looks like a scam or clout bait',
    'a job-seeker, not a buyer',
    'post is older than 3 days',
  ],
  platforms: ['Facebook', 'Threads', 'Instagram', 'LinkedIn'],
  intentPhrases: [
    'looking for someone to',
    'need help with',
    'any recommendations for',
    'who do you use for',
    'hiring a freelancer for',
    'can anyone recommend',
    'struggling to keep up with',
    'is there a service that',
  ],
};

// Assemble the qualifier prompt from the user's engine settings + one lead.
// Split into { system, user }: the rubric + workspace rules are identical for
// every lead in a run, so the AI route sends them as a cached system block
// (a Guard Bee sweep re-reads them once instead of paying for them per lead).
// The joined form below is byte-identical to what this builder always made,
// so the copy-paste flow and its tests are untouched.
export function buildScoringParts(settings, lead) {
  const s = { ...DEFAULT_ENGINE_SETTINGS, ...(settings || {}) };
  const l = lead || {};
  const system = [
    'You are a lead qualifier for a service provider. Decide whether this social media post is from a real potential buyer (green) or should be skipped (red).',
    '',
    `What I sell: ${s.offer || '(not specified)'}`,
    `Who I sell to: ${s.audience || '(not specified)'}`,
    '',
    'GREEN signals (any of these suggests a real buyer):',
    ...(s.greenRules || []).map((r) => `- ${r}`),
    '',
    'RED flags (any of these means skip):',
    ...(s.redRules || []).map((r) => `- ${r}`),
  ].join('\n');
  const user = [
    `Platform: ${l.platform || 'Unknown'}`,
    l.post_url ? `Post link: ${l.post_url}` : null,
    'The post:',
    '"""',
    l.post_text || '(no text provided — judge from the link context above)',
    '"""',
    '',
    'Reply with ONLY this JSON, nothing else — no markdown, no commentary:',
    '{"verdict":"green"|"red","reasons":["which of my rules matched"],"confidence":"high"|"low","suggested_first_line":"a warm, human opening line that references their exact words"}',
  ].filter((line) => line !== null).join('\n');
  return { system, user };
}

export function buildScoringPrompt(settings, lead) {
  const p = buildScoringParts(settings, lead);
  return `${p.system}

${p.user}`;
}

// Ad-library leads need their own rubric. For a post, the TEXT is the buying
// signal — someone describing a problem out loud. For an ad, the text is
// marketing copy and the buying signal is that they are PAYING to run it.
// Scoring an ad with the post rules marks every ad red, because every ad
// sells, ends on a call to action, and shows off results. So the post rules
// are deliberately not included here.
export function buildAdScoringParts(settings, lead) {
  const s = { ...DEFAULT_ENGINE_SETTINGS, ...(settings || {}) };
  const l = lead || {};
  const system = [
    'You are qualifying a business that is currently PAYING to run Facebook ads. This is an advertisement, not a social post.',
    '',
    'IMPORTANT: the ad copy is marketing. Sales language, calls to action, testimonials, discounts and scarcity are all expected in an ad and are NOT a red flag here. Do not judge the writing. Judge the advertiser.',
    '',
    `What I sell: ${s.offer || '(not specified)'}`,
    `Who I sell to: ${s.audience || '(not specified)'}`,
    '',
    'GREEN — a good prospect:',
    '- A service business that books appointments, calls, sessions or clients',
    '- Small or solo enough that the owner still feels the admin (not a national brand)',
    '- Roughly matches who I sell to',
    '- The ad drives to a booking page, enquiry form or landing page, meaning there is a path that can leak',
    '',
    'If there is no ad copy AND no landing page, you cannot verify that this is a real business at all. Do not assume best case from the name alone — say so in the reasons and set confidence to "low".',
    '',
    'RED — skip:',
    '- Another agency, marketing, automation or lead-gen provider (a competitor)',
    '- Ecommerce or a physical product with nothing to book',
    '- Info products, courses, or make-money schemes',
    '- A large brand or franchise that already has an agency',
    '- Nothing in the ad suggests a service anyone books',
  ].join('\n');
  const user = [
    `Advertiser: ${l.author_name || '(unknown)'}`,
    l.dest_url ? `Their ads send people to: ${l.dest_url}` : 'Landing page: not captured',
    'The ad copy:',
    '"""',
    l.post_text || '(no ad text captured — judge from the advertiser name and landing page above)',
    '"""',
    '',
    'Reply with ONLY this JSON, nothing else — no markdown, no commentary:',
    '{"verdict":"green"|"red","reasons":["why this advertiser is or is not a fit"],"confidence":"high"|"low","suggested_first_line":"a warm, human opening line that references what they actually sell"}',
  ].join('\n');
  return { system, user };
}

export function buildAdScoringPrompt(settings, lead) {
  const p = buildAdScoringParts(settings, lead);
  return `${p.system}

${p.user}`;
}

// One entry point so callers never have to remember which rubric applies.
export function buildVerdictPrompt(settings, lead) {
  return lead?.lead_kind === 'ad'
    ? buildAdScoringPrompt(settings, lead)
    : buildScoringPrompt(settings, lead);
}

export function buildVerdictParts(settings, lead) {
  return lead?.lead_kind === 'ad'
    ? buildAdScoringParts(settings, lead)
    : buildScoringParts(settings, lead);
}

// Where a scored lead lands. A green the model wasn't sure about is a guess,
// not a lead — it stays in review for a human look instead of being filed
// under Qualified. Absent confidence counts as unsure on purpose: defaulting
// to confident is how an unverifiable page ends up looking like a prospect.
export function statusForVerdict(verdict, confidence) {
  if (verdict !== 'green') return 'skipped';
  return confidence === 'high' ? 'qualified' : 'new';
}

// Did a person make this call, or the model? A verdict you set by hand wins
// over the AI's and survives a re-score — otherwise the next Guard Bee run
// would quietly undo the judgement you made with your own eyes.
export function isHumanDecided(lead) {
  return lead?.verdict_source === 'you';
}

// Parse whatever the user pasted back from their AI. Tolerates markdown
// fences and chatty preamble by extracting the first {...} span.
export function parseScoringResult(text) {
  const raw = String(text || '').trim();
  if (!raw) return { ok: false, error: 'Nothing pasted yet.' };

  let obj = null;
  try {
    obj = JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        obj = JSON.parse(raw.slice(start, end + 1));
      } catch {
        obj = null;
      }
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, error: 'No JSON found in that reply. Paste the AI\'s full answer, including the {...} part.' };
  }

  const verdict = String(obj.verdict || '').toLowerCase();
  if (!LEAD_VERDICTS.includes(verdict)) {
    return { ok: false, error: 'The JSON is missing a "verdict" of "green" or "red".' };
  }
  const reasons = Array.isArray(obj.reasons) ? obj.reasons.map((r) => String(r)).slice(0, 10) : [];
  const confidence = obj.confidence === 'low' ? 'low' : 'high';
  const suggestedFirstLine =
    typeof obj.suggested_first_line === 'string' ? obj.suggested_first_line.trim() : '';

  return { ok: true, data: { verdict, reasons, confidence, suggestedFirstLine } };
}

// ── Find: intent phrases + per-platform sourcing (spec A6, "it finds") ──

// Starter intent phrases: buyer language, not provider language. Users
// grow this list with the buyer-finder prompt and edit it in the Inbox.
// (Canonical list lives on DEFAULT_ENGINE_SETTINGS.intentPhrases.)
export const DEFAULT_INTENT_PHRASES = DEFAULT_ENGINE_SETTINGS.intentPhrases;

// Where to point the search on each platform.
export const PLATFORM_TIPS = {
  Facebook: 'Search inside niche + local business groups. Sort by new. "Recommendations?" posts are gold.',
  Threads: 'Search the phrase in quotes. Complaint posts and "anyone know someone who…" asks.',
  Instagram: 'Search the phrase, check Tags and Places. Also comments under niche creators.',
  LinkedIn: 'Posts tab, past week. Founder complaints and "we need help with" posts beat job listings.',
  Upwork: 'Newest jobs in your category with under 5 proposals. Speed wins here.',
  Reddit: 'site search the phrase + your niche subreddits. Weekly "who is hiring" threads.',
  X: 'Advanced search: the phrase in quotes, language filter, past 3 days. Reply fast.',
  Other: 'TikTok comments, OnlineJobs.ph listings, Discord and Slack communities in your niche.',
};

// The buyer-finder prompt, filled from engine settings. Copy-paste into
// ChatGPT or Claude; paste the resulting phrases into your phrase list.
export function buildBuyerFinderPrompt(settings) {
  const s = { ...DEFAULT_ENGINE_SETTINGS, ...(settings || {}) };
  return [
    'You help me find people who are ACTIVELY looking to hire for this service:',
    '',
    `Service: ${s.positioning || s.offer || '(fill in Settings first)'}`,
    `Ideal buyer: ${s.audience || '(fill in Settings first)'}`,
    '',
    'Give me 25 exact phrases a person types on social media when they need this service RIGHT NOW. Rules:',
    '- Phrases a buyer types, never phrases a provider types',
    '- Include hiring language ("looking for", "need someone", "recommendations for")',
    '- Include problem language (describing the pain without naming the service)',
    '- Mix lengths: 2-word searches up to full sentences',
    '- No hashtags, no marketing speak',
    '',
    'Output as a plain list, one phrase per line, no numbering.',
  ].join('\n');
}

// The message-writer prompt for one qualified lead: a DM in the user's
// voice reacting to the lead's exact post. Split like the scoring prompt:
// the voice-extraction step + samples + service line are the same for every
// lead in a Honey Bee run, so the AI route caches them as the system block.
// The voice samples are the bulk of this prompt, which is where the saving is.
export function buildMessageWriterParts(settings, lead) {
  const s = { ...DEFAULT_ENGINE_SETTINGS, ...(settings || {}) };
  const l = lead || {};
  const samples = (s.voiceSamples || []).filter(Boolean);
  const sampleBlock = samples.length
    ? samples.map((m, i) => `${i + 1}. ${m}`).join('\n')
    : '1. [PASTE A REAL DM YOU SENT THAT GOT A REPLY]\n2. [PASTE ANOTHER ONE]';
  const system = [
    "Write a DM that sounds like ME, reacting to this person's exact post. Two steps.",
    '',
    'STEP A — Extract my voice from these real messages I sent. Voice is patterns, not vocabulary: sentence length, how I open, punctuation habits, warmth level, how I ask questions. Write a 3-line voice profile first.',
    sampleBlock,
    '',
    'STEP B — Write the DM using that exact voice profile.',
    `My service: ${s.positioning || s.offer || '[YOUR OFFER, one line]'}`,
  ].join('\n');
  const user = [
    `Platform: ${l.platform || '[WHERE THIS POST LIVES]'} — match its norms: LinkedIn slightly more formal, IG and Threads casual and short, Upwork structured.`,
    l.author_name ? `Their name: ${l.author_name}` : null,
    'Their post:',
    '"""',
    l.post_text || '[PASTE THE POST]',
    '"""',
    '',
    'Rules:',
    '- First line reacts to THEIR words, proving I read it. Not a compliment sandwich.',
    '- Under 80 words total. One question at the end, low pressure, no link, no pitch.',
    '- Banned: "I hope this finds you well", "I noticed", "I came across", "As a [title]", "game-changer", "no worries if not", any emoji unless my samples use them.',
    '- Do not mention how recently they posted.',
    '',
    'Give me 2 versions: SAFE (closest to my voice profile) and BOLDER (one notch more direct, same length).',
  ].filter((line) => line !== null).join('\n');
  return { system, user };
}

export function buildMessageWriterPrompt(settings, lead) {
  const p = buildMessageWriterParts(settings, lead);
  return `${p.system}\n${p.user}`;
}


function parseSuggestedLine(lead) {
  const notes = String(lead?.notes || '');
  const m = notes.match(/suggested[_ ]first[_ ]line[":\s]+([^\n"]+)/i);
  return m ? m[1].trim() : '';
}

// Deep-link a phrase straight into each platform's own search, so "find"
// is one click instead of copy → switch tab → paste. Sorted-by-new where
// the platform supports it (fresh posts are the whole game).
export function buildSearchUrl(platform, phrase) {
  const q = encodeURIComponent(String(phrase || '').trim());
  switch (platform) {
    case 'Facebook': return `https://www.facebook.com/search/posts/?q=${q}`;
    case 'Threads': return `https://www.threads.net/search?q=${q}`;
    case 'Instagram': return `https://www.instagram.com/explore/search/keyword/?q=${q}`;
    case 'LinkedIn': return `https://www.linkedin.com/search/results/content/?keywords=${q}&sortBy=%22date_posted%22`;
    case 'Upwork': return `https://www.upwork.com/nx/search/jobs/?q=${q}&sort=recency`;
    case 'Reddit': return `https://www.reddit.com/search/?q=${q}&sort=new`;
    case 'X': return `https://x.com/search?q=${q}&f=live`;
    default: return `https://www.google.com/search?q=${q}`;
  }
}

// Facebook Ad Library deep link: public, no login — shows whether a page
// is running active ads (the ads-without-organic prospect signal).
export function buildAdLibraryUrl(name) {
  const q = encodeURIComponent(String(name || '').trim());
  return `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&q=${q}&search_type=keyword_unordered`;
}
