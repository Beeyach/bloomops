// The words the app uses to explain itself.
//
// Kept here rather than typed into each component, for one reason: the same
// idea was being explained in three places in three slightly different ways,
// and the version on the card and the version on the help page could disagree
// without anybody noticing. One definition, read by whoever needs it.
//
// Nothing here is generated. There is no model call behind any of this text,
// and there must never be: help that changes wording between two readings is
// worse than no help, and a page that costs money to open will not be opened.
//
// Rules for anything added here:
//   plain words, no schema names, no internal state strings
//   say what it means for the person, not what the code does
//   if it depends on a setting, it does not belong here (see sending-state)
//   if the prospect page says it too, the classification lives in concepts.mjs

import { CONCEPTS } from './concepts.mjs';

// The one-line model. Five beats, deliberately not six.
//
// "LTB prepares" rather than "Claude writes": preparation is native today and
// may be skill-assisted tomorrow, and the difference is not something a person
// operating the product has to hold in their head.
export const FLOW = [
  { step: 'LTB finds', sub: 'businesses to look at' },
  { step: 'LTB checks', sub: 'their site, for something true' },
  { step: 'LTB prepares', sub: 'a reason and a draft' },
  { step: 'You decide', sub: 'approve, skip, or reply' },
  { step: 'LTB keeps track', sub: 'replies, dates, what was sent' },
];

export const FLOW_LINE = 'Most of the research and sorting happens in the background. Today shows the few things that actually need you.';

// What the app does without being asked.
//
// Every line here was checked against the code that does it. "When eligible"
// and "when it can pay for it" are load-bearing: they are the difference
// between a description and a promise nobody kept.
export const AUTOMATIC = [
  { what: 'First look at a new business', how: 'Free rules decide whether they are worth any spend at all.' },
  { what: 'Reading their site', how: 'One check of their own pages, when they pass the first look.' },
  { what: 'Finding a way to reach them', how: 'Their own public pages only. Never bought, never guessed.' },
  { what: 'Keeping what it found', how: 'Every finding is stored with where it came from and when.' },
  { what: 'Deciding if there is a real reason to write', how: 'Strong, or not, on the evidence. It will say no.' },
  { what: 'Working out how much effort they get', how: 'From your rating and what the checks found.' },
  { what: 'Writing the draft', how: 'When there is enough to say, and the day\'s budget allows it.' },
  { what: 'Reading your replies', how: 'Your mailbox syncs itself. A reply stops the outbound cadence.' },
  { what: 'Bringing back deferrals', how: 'The day you chose, they reappear in Today.' },
  { what: 'Not sending twice', how: 'Every send is checked against what already went out.' },
];

// What only a person can do. Sending is deliberately not in this list, because
// whether it is yours depends on a setting; sending-state answers that.
export const YOURS = [
  { what: 'Starting a new conversation', how: 'Nothing cold goes out until you approve the draft.' },
  { what: 'Replying to real people', how: 'When somebody writes back, that is yours. The app stops and waits.' },
  { what: 'The judgement calls', how: 'When the app has enough to ask a specific question, it asks instead of guessing.' },
  { what: 'Choosing to come back later', how: 'You pick the date. It holds it.' },
  { what: 'Saying never', how: 'Do not contact is your call and nothing overrides it.' },
];

// The daily loop. Four steps, because five is a list somebody skims.
export const DAILY = [
  {
    title: 'Open Today',
    body: 'Today is your work queue. If something needs you, it should be here. If it is not here, it does not need you.',
  },
  {
    title: 'Work down the top sections',
    body: 'They are in order on purpose. Somebody waiting on a reply from you always comes before a stranger with a good angle.',
  },
  {
    title: 'Let the background work run',
    body: 'Checking sites, looking for addresses, reading your mailbox and bringing back deferrals all happen without you opening anything.',
  },
  {
    title: 'Come back when Today has something new',
    body: 'You do not have to go through the prospect list. That is what Today is for.',
  },
];

// Why a person is in a bucket, in one to three sentences.
//
// Keyed by the bucket ids in today-buckets.mjs so the bucket pages can look
// themselves up rather than each carrying a paragraph.
export const BUCKET_HELP = {
  replies: 'Somebody wrote back, and nothing has gone to them since. The app has stopped every automatic touch for this person until you answer.',
  approvals: 'LTB found something true about this business, decided it is a real reason to write, and wrote a draft. Read the reason and the email before you decide.',
  decisions: 'The app had enough information to ask you a specific question rather than guess at the answer. Nothing moves on this prospect until you say.',
  deferrals: 'You chose a date to come back to these, and the date has arrived. Nothing has happened to them in the meantime.',
  blocked: 'A background check stopped and said why. It does not mean the prospect is bad. Most of these are worth one press of Try again.',
  held: 'These are still worth contacting. What is missing is a safe way to reach them, and that is recoverable. Nobody has been rejected here.',
  legacy: 'Drafts written before the current rules. They were not checked the way new outreach is, so they are kept separate rather than mixed in.',
};

// The words on the screen, explained.
//
// Only states somebody meets in normal use. Internal vocabulary (fingerprints,
// attempt keys, claim leases) is deliberately absent: it is real, it matters,
// and it belongs in the engineering notes rather than in front of a person
// trying to decide what to do this morning.
// The paragraph under each term. Keyed by concept rather than by the word, so
// a term cannot be renamed in one place and left behind in the other.
const LONG_FORM = {
  STRONG: 'Four things have to be true at once: they are the kind of business you can help, there is something specific worth writing about, it is a problem you actually fix, and the evidence behind it holds up. Strong is not a prediction that they will buy, and it says nothing about whether they can afford you.',
  EVIDENCE: 'Everything the app claims about a business traces back to something it read on their own site, or something you typed in yourself. If there is no evidence, there is no email, because there would be nothing true to say.',
  GREEN: 'It raises how much effort this prospect gets: up to three emails instead of two. It does not make anything true about them. A green heart cannot turn a business with nothing checked into a Strong one.',
  CROSS: 'They still get one email if there is a real reason to write. What they do not get is paid research or a follow-up sequence. This is not the same as do not contact, which is a separate and final decision.',
  HELD: 'Either an address was never found, or the one we had stopped working. Everything else about them is kept: your notes, the site check, the priority. Held is not a rejection and nothing about it is a judgement of the business.',
  PARKED: 'They failed the first look, there is nothing here you sell a fix for, or there is nothing on their site to check. Unlike Held, this is a conclusion rather than a missing piece, and it takes new information to change it.',
  DEFERRED: 'Nothing happens to them until the date you picked, and then they reappear under Ready to reconsider.',
  PRIORITY: 'A ceiling, not a plan. Three at the top, two in the middle, one at the bottom. Nothing is obliged to use them all, and a draft that was never written is never sent.',
  DRAFT: 'A draft sits on the prospect until you approve it. Editing it before you approve is normal and expected.',
  WATCHING: 'Used while a piece of automation is being trusted. You can read what it would have sent and what stopped it, without anything leaving.',
  AUTOMATION_STOPPED: 'A site would not load, a check timed out, a budget ran out for the day. It is about the run, not about the prospect.',
};

// The term and the one-line meaning come from lib/concepts.mjs, which the
// prospect page reads as well. Only the paragraph lives here: a glossary can
// afford one and a status card cannot, and that is the single thing the two
// surfaces are allowed to differ on.
export const GLOSSARY = CONCEPTS.map((c) => ({
  term: c.term,
  short: c.short,
  judgement: c.judgement,
  recoverable: c.recoverable,
  body: LONG_FORM[c.key],
}));

// Five things worth doing once. Not a gate, not a tour, and never a send.
//
// Deliberately no "send a real email" step: onboarding that only completes by
// emailing a stranger is onboarding that pressures somebody into a send they
// have not thought about.
export const CHECKLIST = [
  { id: 'prospects', title: 'Have some prospects', detail: 'Add one by hand or import a list. Nothing else works without this.', action: 'Open Prospects', go: 'prospects' },
  { id: 'today', title: 'Look at Today', detail: 'This is the screen you will use every day. Everything else is where things live, not where you work.', action: 'Open Today', go: 'today' },
  { id: 'evidence', title: 'Read what was found about someone', detail: 'Open any prospect and look at the findings. That is what every email is built from.', action: 'Open Prospects', go: 'prospects' },
  { id: 'draft', title: 'Read one prepared draft', detail: 'Ready for approval on Today. Read the reason first, then the email.', action: 'Open Today', go: 'today' },
  { id: 'sending', title: 'Know what sends', detail: 'One short panel that says exactly which presses send an email right now.', action: 'Start here', go: 'start' },
];

export const glossaryFor = (term) => GLOSSARY.find((g) => g.term === term) || null;
export const bucketHelp = (id) => BUCKET_HELP[id] || null;
