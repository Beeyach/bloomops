// What each AI task is told about the workspace it is working for.
//
// Two problems, one file.
//
// The first is a leak. Nine prompts opened with a sentence like "You write one
// first-contact email for Ary, who builds booking and follow-up systems for
// small businesses." That is a workspace fact welded into a product module. It
// worked because there is one workspace; it also meant the offer existed in two
// places, the Hive and the source code, and only one of them was editable. A
// second workspace would have received emails describing somebody else's
// business.
//
// The second is the opposite mistake, and the easy one to make while fixing the
// first: handing every call the entire Hive record. Voice samples are the
// largest thing in settings and belong in exactly two prompts. Qualification
// rules belong in the lead scorer and nowhere near a call-prep brief. So each
// task declares the minimum it needs, and gets that.

// Identity, resolved from configuration with honest fallbacks.
//
// A workspace that has not filled these in still works: the prompts read "this
// workspace" rather than inventing a name. Silence is better than a placeholder
// that ends up in a real email.
export function identity(settings = {}) {
  const operator = String(settings.operatorName || '').trim();
  const business = String(settings.businessName || '').trim();
  const offerLine = String(settings.positioning || settings.offer || '').trim();

  let who;
  if (operator && business) who = `${operator}, who runs ${business}`;
  else if (operator) who = operator;
  else if (business) who = business;
  else who = 'this workspace';

  return {
    operator: operator || null,
    business: business || null,
    // The name to use inside a sentence: "You draft replies for ___."
    who,
    // How the sender refers to themselves in the first person. Used where a
    // prompt needs to say whose voice it is without guessing a pronoun.
    self: operator || business || 'the sender',
    offerLine: offerLine || null,
  };
}

// The tasks that read workspace context, and what each one actually needs.
//
// Adding a field to a task here is a deliberate act. The list is short on
// purpose: every field is tokens on every call, and most of them do not change
// the answer.
export const TASK = {
  OUTREACH: 'outreach',
  FOLLOWUP: 'follow-up',
  REPLY_COACH: 'reply-coach',
  CALL_PREP: 'call-prep',
  PROPOSAL: 'proposal',
  BEST5: 'best5',
  OBJECTIONS: 'objections',
  VOICE_NOTE: 'voice-note',
  CONTENT: 'content-scripts',
  SCORE: 'score',
  ASSETS: 'assets',
};

const NEEDS = {
  // First contact: what we sell, who we sell to, how we sound, how we close.
  [TASK.OUTREACH]: ['identity', 'offer', 'audience', 'voiceSamples'],
  // A follow-up says less and reuses the thread, so it needs no audience line.
  [TASK.FOLLOWUP]: ['identity', 'offer'],
  // Answering a real person: voice matters most, the offer only as background.
  [TASK.REPLY_COACH]: ['identity', 'offer'],
  // A brief about them. Our offer is context; our voice samples are not.
  [TASK.CALL_PREP]: ['identity', 'offer'],
  // The template carries the prices. Nothing else from the Hive belongs.
  [TASK.PROPOSAL]: ['identity'],
  // Ranking already happened in code. This writes sentences.
  [TASK.BEST5]: ['identity'],
  // Reading history back. No offer, no voice.
  [TASK.OBJECTIONS]: ['identity'],
  // Turning speech into fields. Needs nothing about the business.
  [TASK.VOICE_NOTE]: [],
  // Public content: the offer and the audience, not the voice samples, which
  // are one-to-one messages and read wrong in a script.
  [TASK.CONTENT]: ['identity', 'offer', 'audience'],
  // Lead scoring is the one task that reads the qualification rules.
  [TASK.SCORE]: ['offer', 'audience', 'rules'],
  // Asset decisions are made in code. Nothing is sent to a model.
  [TASK.ASSETS]: [],
};

// The minimum context for one task. Returns only what that task declared.
export function contextFor(task, settings = {}) {
  const needs = NEEDS[task] || [];
  const out = {};
  if (needs.includes('identity')) out.identity = identity(settings);
  if (needs.includes('offer')) out.offer = String(settings.positioning || settings.offer || '').trim() || null;
  if (needs.includes('audience')) out.audience = String(settings.audience || '').trim() || null;
  if (needs.includes('voiceSamples')) out.voiceSamples = (settings.voiceSamples || []).filter(Boolean).slice(0, 3);
  if (needs.includes('rules')) {
    out.greenRules = settings.greenRules || [];
    out.redRules = settings.redRules || [];
  }
  return out;
}

// ── The generation context hash ──────────────────────────────────────────
//
// A package stores this so that "was this email written for the business we
// are today" is answerable. That only works if the hash moves when something
// that could change the writing moves, and stays still when something that
// could not does.
//
// IN, because each of these is either quoted into a prompt or decides which
// prospects reach one:
export const HASHED_FIELDS = [
  'operatorName',   // named in every prompt
  'businessName',   // named in every prompt
  'offer',          // quoted
  'positioning',    // quoted, and preferred over offer
  'audience',       // quoted, and used by workspace fit
  'voiceSamples',   // quoted verbatim into outreach
  'greenRules',     // decides qualification, which decides who gets written to
  'redRules',
];

// OUT, and each for a stated reason. Listed rather than merely omitted so that
// a future field has to be argued about instead of silently defaulting into
// the hash and invalidating every package in the database.
export const NOT_HASHED = {
  aiKey: 'a credential, and rotating one does not change a word',
  aiModel: 'stored on the package itself, where it can be compared directly',
  apifyToken: 'a credential',
  hiddenStages: 'shortens a dropdown',
  platforms: 'where leads are searched for, not how they are written to',
  intentPhrases: 'a search aid',
  promptProjects: 'the copy-paste workflow, which produces nothing stored',
  sequenceTemplate: 'the five-email template, applied per prospect and stored on the row',
};

// Stable across key order and across whitespace edits that change nothing.
export function contextHash(settings = {}, hash) {
  const parts = HASHED_FIELDS.map((f) => {
    const v = settings[f];
    if (Array.isArray(v)) return `${f}=${v.filter(Boolean).map((x) => String(x).trim()).join('|')}`;
    return `${f}=${String(v == null ? '' : v).trim()}`;
  });
  return hash(parts.join('\n'));
}
