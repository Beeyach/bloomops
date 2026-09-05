// What an inbound reply means.
//
// Rules first, model second. Roughly half of what lands in a cold-outreach
// inbox is an autoresponder, a bounce or an unsubscribe, and none of those
// needs judgement: they announce themselves in the headers or the first line.
// Spending a model call to discover that "Automatic reply: Out of office" is
// an out-of-office is the kind of waste that makes AI features expensive for
// no reason.
//
// The categories come from the daily-reply-sync skill, which is the
// specification for what they mean and which stage each implies. This is the
// product-side implementation of that table, not a second opinion about it.

export const REPLY = {
  INTERESTED: 'interested',
  QUESTION: 'question',
  PRICE: 'price',
  OBJECTION: 'objection',
  NOT_NOW: 'not-now',
  REFERRAL: 'referral',
  WRONG_PERSON: 'wrong-person',
  DECLINE: 'decline',
  UNSUBSCRIBE: 'unsubscribe',
  OUT_OF_OFFICE: 'out-of-office',
  BOUNCE: 'bounce',
  UNKNOWN: 'unknown',
};

// Which categories are a real human answering. The rest must never inflate a
// reply rate: an autoresponder is not a reply and a bounce is the opposite of
// one.
export const REAL_REPLY = new Set([
  REPLY.INTERESTED, REPLY.QUESTION, REPLY.PRICE, REPLY.OBJECTION,
  REPLY.NOT_NOW, REPLY.REFERRAL, REPLY.WRONG_PERSON, REPLY.DECLINE,
]);

// Which count as positive. Narrower than "not a decline" on purpose: an
// objection is engagement, not interest.
export const POSITIVE_REPLY = new Set([REPLY.INTERESTED, REPLY.QUESTION, REPLY.PRICE]);

// Which stop the sequence outright.
export const STOPS_OUTBOUND = new Set([
  REPLY.INTERESTED, REPLY.QUESTION, REPLY.PRICE, REPLY.OBJECTION,
  REPLY.NOT_NOW, REPLY.REFERRAL, REPLY.WRONG_PERSON, REPLY.DECLINE,
  REPLY.UNSUBSCRIBE, REPLY.BOUNCE,
]);

// Which need a person. Everything warm, plus anything we could not read.
export const NEEDS_HUMAN = new Set([
  REPLY.INTERESTED, REPLY.QUESTION, REPLY.PRICE, REPLY.OBJECTION,
  REPLY.REFERRAL, REPLY.WRONG_PERSON, REPLY.UNKNOWN,
]);

const BOUNCE_SENDERS = /(mailer-daemon|postmaster|no-?reply@.*(google|outlook|protection)|mailerdaemon)/i;
const BOUNCE_SUBJECT = /(undeliverable|delivery status notification|returned mail|mail delivery (failed|subsystem)|address not found|delivery has failed)/i;
const OOO_SUBJECT = /(out of (the )?office|automatic reply|autoreply|auto-reply|away from (my|the) (desk|office)|on (annual )?leave|maternity leave|vacation response)/i;
const OOO_BODY = /\b(i am|i'm|we are|we're) (currently )?(out of the office|away|on leave|on holiday|on annual leave)\b|\bthank you for your (email|message),? i am currently\b/i;
const UNSUB = /\b(unsubscribe|opt.?out|remove me from (your|this) (list|mailing)|take me off (your|this) list|stop (emailing|contacting) me|do not (contact|email) me again)\b/i;

// Deterministic pass. Returns a result only when it is genuinely sure;
// otherwise null, and the caller decides whether to spend a model call.
export function classifyByRules({ fromAddress = '', subject = '', snippet = '', headers = {} } = {}) {
  const from = String(fromAddress || '').toLowerCase();
  const subj = String(subject || '');
  const body = String(snippet || '');
  const both = `${subj}\n${body}`;

  // Bounces first: they are the only category where the sender is not a
  // person, so reading them as an opinion would be nonsense.
  if (BOUNCE_SENDERS.test(from) || BOUNCE_SUBJECT.test(subj) || headers['x-failed-recipients']) {
    return { classification: REPLY.BOUNCE, confidence: 'high', by: 'rules', why: 'Delivery failure, not a person.' };
  }

  // Autoresponders announce themselves in headers designed for exactly this.
  if (headers['auto-submitted'] && headers['auto-submitted'] !== 'no') {
    return { classification: REPLY.OUT_OF_OFFICE, confidence: 'high', by: 'rules', why: 'Marked auto-submitted by the sending server.' };
  }
  if (headers['x-autoreply'] || headers['x-autorespond'] || headers['precedence'] === 'auto_reply') {
    return { classification: REPLY.OUT_OF_OFFICE, confidence: 'high', by: 'rules', why: 'Autoresponder header.' };
  }
  if (OOO_SUBJECT.test(subj)) {
    return { classification: REPLY.OUT_OF_OFFICE, confidence: 'high', by: 'rules', why: 'Out-of-office subject line.' };
  }
  if (OOO_BODY.test(body)) {
    return { classification: REPLY.OUT_OF_OFFICE, confidence: 'medium', by: 'rules', why: 'Reads as an out-of-office.' };
  }

  // Unsubscribe. Checked against the whole message rather than the opening,
  // because it is frequently the last line of an otherwise ordinary reply,
  // and missing it is the one mistake with a legal edge to it.
  if (UNSUB.test(both)) {
    return { classification: REPLY.UNSUBSCRIBE, confidence: 'high', by: 'rules', why: 'Asked to be removed.' };
  }

  // Everything else is a human saying something, and what they meant is not a
  // regex problem. "No thanks" and "no, thanks for explaining, what does it
  // cost" begin identically.
  return null;
}

// The prompt for the model pass. Small on purpose: this runs on the cheap tier
// and its whole job is to pick one label and say why in a few words.
export function buildClassifyParts(settings, { subject = '', snippet = '', fromAddress = '' } = {}) {
  const system = `You label one reply to a cold outreach email. Output JSON only.

Labels, pick exactly one:
- interested: wants to talk, asks to know more, says yes
- question: asks something specific before deciding
- price: asks what it costs
- objection: pushes back on a specific thing (already have someone, tried this, too busy for it)
- not-now: not against it, wrong timing. "check back later", "after summer"
- referral: points at somebody else who handles this
- wrong-person: says they are not the right contact and does not name a replacement
- decline: not interested, no thanks
- unknown: you genuinely cannot tell

Rules:
- Read what they wrote, not what you hope. "Thanks but we're all set" is decline, not objection.
- "Not right now" is not-now, never decline.
- If a specific time is named, put it in when_iso as YYYY-MM-DD (first of the month if only a month is given). Otherwise null. Never invent a date.
- confidence: high only if the message is unambiguous. If you are picking between two labels, say medium. If you are guessing, say low and use unknown.

Also pull out what they stated. Stated, not implied: null unless the words are there.
- referred_to: somebody else they pointed at
- objection: their words for what is stopping them, under 15 words
- provider: a tool or person they say already does this
- new_contact: a corrected address for them
- price_concern: true only if they mentioned cost

Output exactly:
{"classification":"...","confidence":"high|medium|low","why":"under 12 words","when_iso":null,"referred_to":null,"objection":null,"provider":null,"new_contact":null,"price_concern":false}`;

  const user = `From: ${String(fromAddress).slice(0, 120)}
Subject: ${String(subject).slice(0, 200)}

${String(snippet).slice(0, 1200)}`;

  return { system, user };
}

// Reads the model's answer, and refuses anything it did not actually say.
export function parseClassifyResult(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return { classification: REPLY.UNKNOWN, confidence: 'low', by: 'model', why: 'Could not read the answer.' };
  let v;
  try { v = JSON.parse(m[0]); } catch {
    return { classification: REPLY.UNKNOWN, confidence: 'low', by: 'model', why: 'Could not read the answer.' };
  }
  const allowed = new Set(Object.values(REPLY));
  const c = allowed.has(v.classification) ? v.classification : REPLY.UNKNOWN;
  const conf = ['high', 'medium', 'low'].includes(v.confidence) ? v.confidence : 'low';
  // A date the model invented must at least be a real one.
  let when = null;
  const raw = String(v.when_iso || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T00:00:00Z`);
    if (!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === raw) when = raw;
  }
  return {
    classification: c,
    // A low-confidence label is not a label. Forcing it to unknown is what
    // keeps a guess from silently stopping or restarting somebody's outreach.
    ...(conf === 'low' && c !== REPLY.UNKNOWN ? { classification: REPLY.UNKNOWN, downgradedFrom: c } : {}),
    confidence: conf,
    by: 'model',
    why: String(v.why || '').slice(0, 120),
    whenIso: when,
    extracted: extractedFrom(v, when),
  };
}

// What the reply stated, kept apart from what it was.
//
// This is conversation evidence and it must never be mistaken for a verified
// finding about their website. The two are used differently: a verified
// finding is something a follow-up may point at, and this is something a
// person said, which may be wrong, out of date, or polite. It carries its own
// source so the difference survives being stored.
const str = (v, max) => {
  const s = String(v ?? '').trim();
  return s && s.toLowerCase() !== 'null' ? s.slice(0, max) : null;
};

export function extractedFrom(v = {}, whenIso = null) {
  const out = {
    source: 'reply',
    requestedDate: whenIso,
    referredTo: str(v.referred_to, 120),
    objection: str(v.objection, 160),
    provider: str(v.provider, 80),
    newContact: str(v.new_contact, 160),
    priceConcern: v.price_concern === true,
  };
  const anything = out.requestedDate || out.referredTo || out.objection || out.provider || out.newContact || out.priceConcern;
  return anything ? out : null;
}

// What the classification implies for the prospect. Conservative throughout:
// where the skill says "ask Ary rather than inventing a date", this returns no
// date and flags the human.
export function actionFor(classification, { whenIso = null } = {}) {
  switch (classification) {
    case REPLY.INTERESTED:
      return { stage: 'Interested', replyType: 'interested', stopOutbound: true, needsHuman: true, note: 'Reply received: interested. Automation paused, needs you.' };
    case REPLY.QUESTION:
      return { stage: 'Interested', replyType: 'interested', stopOutbound: true, needsHuman: true, note: 'Reply received: a question. Automation paused, needs you.' };
    case REPLY.PRICE:
      return { stage: 'Interested', replyType: 'interested', stopOutbound: true, needsHuman: true, note: 'Reply received: asking about price. Automation paused, needs you.' };
    case REPLY.OBJECTION:
      return { stage: null, replyType: 'interested', stopOutbound: true, needsHuman: true, note: 'Reply received: an objection. Automation paused, needs you.' };
    case REPLY.NOT_NOW:
      return {
        stage: 'Snoozed', replyType: 'defer', stopOutbound: true,
        // A parseable date parks it. An unparseable one is a question for a
        // person, never a date we invented.
        nextActionDate: whenIso,
        needsHuman: !whenIso,
        note: whenIso ? `Reply received: not now. Parked until ${whenIso}.` : 'Reply received: not now, no date given. Needs you to set one.',
      };
    case REPLY.REFERRAL:
      return { stage: null, replyType: null, stopOutbound: true, needsHuman: true, note: 'Reply received: pointed at somebody else. Needs you.' };
    case REPLY.WRONG_PERSON:
      // Stops this contact, not the company. The business may be perfectly
      // good behind a different address.
      return { stage: null, replyType: null, stopOutbound: true, needsHuman: true, note: 'Reply received: wrong contact. Stopped sending to this address.' };
    case REPLY.DECLINE:
      return { stage: 'Not This Offer', replyType: 'decline', stopOutbound: true, needsHuman: false, note: 'Reply received: not interested in this. Outreach stopped.' };
    case REPLY.UNSUBSCRIBE:
      return { stage: 'Rejected', replyType: 'decline', stopOutbound: true, doNotContact: true, unsubscribed: true, needsHuman: false, note: 'They asked to be removed. Marked do not contact.' };
    case REPLY.OUT_OF_OFFICE:
      // Not an answer either way. It must not set `replied`, or an
      // autoresponder becomes a reply in every metric in the app.
      return { stage: null, replyType: null, stopOutbound: false, isRealReply: false, needsHuman: false, note: 'Out of office. Not counted as a reply.' };
    case REPLY.BOUNCE:
      return { stage: 'Invalid Email', replyType: null, stopOutbound: true, isRealReply: false, needsHuman: false, note: 'The address bounced.' };
    default:
      return { stage: null, replyType: null, stopOutbound: true, needsHuman: true, note: 'A reply came in that could not be read. Needs you.' };
  }
}
