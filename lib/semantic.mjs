// One meaning, one icon, one colour.
//
// Chapter 10's finding was that hierarchy was still being carried almost
// entirely by font size and weight — nine chapters of raising the type scale
// and the answer to "what is this row" was still "read the sentence". This
// module is the alternative: every recurring concept in the app gets exactly
// one icon and exactly one colour family, declared once, so a reply looks the
// same on Today, in the drawer and in the list without three components each
// deciding for themselves.
//
// Two deliberate limits:
//
//   Five families, not twelve. Blue is information, sage is done, amber is
//   waiting, red is wrong, rose is the brand. A sixth family would mean
//   nobody could remember what any of them meant.
//
//   Colour is never the only signal. Every entry carries a label and an icon
//   as well, because a colour-blind reader and a greyscale screenshot both
//   have to work.

// The five families, plus a neutral for everything that is merely a fact.
export const TONE = {
  INFO: 'info',       // conversation, replies, anything being told to you
  GOOD: 'good',       // approved, complete, healthy
  WAIT: 'wait',       // due, waiting, needs attention
  BAD: 'bad',         // danger, do-not-contact, failed
  BRAND: 'brand',     // the brand, and primary actions only
  NEUTRAL: 'neutral', // a fact with no judgement attached
};

export const TONES = Object.values(TONE);

// The icon vocabulary. Same concept, same glyph, everywhere.
//
// Names are from components/Icons.jsx. Nothing here invents a glyph: if a
// concept has no icon in the library it gets one added there rather than a
// near-miss reused, because a near-miss is how "message" ends up meaning both
// a reply and a note.
export const ICON = {
  conversation: 'message',
  reply: 'message',
  email: 'mail',
  approval: 'check-circle',
  followup: 'clock',
  decision: 'split',
  exception: 'alert-triangle',
  evidence: 'shield',
  video: 'play',
  activity: 'history',
  business: 'building',
  person: 'user',
  system: 'activity',
  hive: 'bee',
  next: 'arrow-right',
  blocked: 'ban',
  waiting: 'hourglass',
  sent: 'send',
  draft: 'file-text',
  client: 'briefcase',
  onboarding: 'list-todo',
};

// The concepts that recur across surfaces, each with its icon, its family and
// the words to say it in. A component asks for a kind; it does not pick a
// colour, a glyph or a phrase of its own.
export const KIND = {
  reply:      { icon: ICON.reply, tone: TONE.INFO, label: 'Needs reply' },
  conversation: { icon: ICON.conversation, tone: TONE.INFO, label: 'Conversation open' },
  approval:   { icon: ICON.approval, tone: TONE.GOOD, label: 'Needs approval' },
  approved:   { icon: ICON.approval, tone: TONE.GOOD, label: 'Approved' },
  sent:       { icon: ICON.sent, tone: TONE.GOOD, label: 'Sent' },
  followup:   { icon: ICON.followup, tone: TONE.WAIT, label: 'Due' },
  waiting:    { icon: ICON.waiting, tone: TONE.WAIT, label: 'Waiting' },
  decision:   { icon: ICON.decision, tone: TONE.WAIT, label: 'Needs decision' },
  exception:  { icon: ICON.exception, tone: TONE.WAIT, label: 'Stopped' },
  failed:     { icon: ICON.exception, tone: TONE.BAD, label: 'Failed' },
  dnc:        { icon: ICON.blocked, tone: TONE.BAD, label: 'Do not contact' },
  video:      { icon: ICON.video, tone: TONE.INFO, label: 'Video' },
  watched:    { icon: ICON.video, tone: TONE.GOOD, label: 'Watched' },
  evidence:   { icon: ICON.evidence, tone: TONE.NEUTRAL, label: 'Evidence' },
  draft:      { icon: ICON.draft, tone: TONE.NEUTRAL, label: 'Draft' },
  client:     { icon: ICON.client, tone: TONE.GOOD, label: 'Client' },
};

// Today's five tabs, as the same vocabulary. The tab strip, the panel header
// and every card inside it read from here, so a tab and its contents cannot
// wear different colours for the same idea.
export const TODAY_TAB_KIND = {
  replies: 'reply',
  approvals: 'approval',
  followups: 'followup',
  decisions: 'decision',
  exceptions: 'exception',
};

export const kindOf = (name) => KIND[name] || KIND.evidence;
export const toneOf = (name) => kindOf(name).tone;
export const iconOf = (name) => kindOf(name).icon;

// Duration, in the shortest honest form. "Waiting 3 days" beside a clock icon
// is three words saying what "3d" says, and the row has four other things to
// fit. Anything under a day rounds up to 1d rather than saying 0d.
export function shortDuration(days) {
  // Number(null) and Number('') are both 0, so an absent value would have
  // rendered as "1d" — a fact the record does not have, drawn as one it does.
  if (days == null || days === '') return null;
  const n = Number(days);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n < 1) return '1d';
  if (n < 30) return `${Math.round(n)}d`;
  if (n < 365) return `${Math.round(n / 30)}mo`;
  return `${Math.round(n / 365)}y`;
}
