// What to actually send when somebody says yes.
//
// 465 prospects received a cold video and produced no attributed client. 607
// received a cold PDF and produced no attributed client. Both comparisons are
// badly confounded, because videos went out around email 3 and PDFs at email 5,
// so anybody who replied early never got one. Video is not proven to hurt.
//
// What is not confounded is the ordering mistake: both assets were made for
// people who had already ignored two emails, and nobody had asked for either.
//
// So the asset stops being a sequence step and becomes fulfilment. The cold
// email offers one specific thing, the reply accepts it, and this picks the
// smallest form that honestly delivers what was promised.

export const RUNG = {
  PLAIN_TEXT: 'PLAIN_TEXT',
  RUNDOWN: 'RUNDOWN',
  PDF: 'PDF',
  VIDEO: 'VIDEO',
  LIVE_AUDIT: 'LIVE_AUDIT',
};

// Cheapest first. The rule is to stop at the first rung that satisfies the
// promise, not to pick the most impressive one available.
export const LADDER = [RUNG.PLAIN_TEXT, RUNG.RUNDOWN, RUNG.PDF, RUNG.VIDEO, RUNG.LIVE_AUDIT];

export const ASSET_TRIGGER = {
  ACCEPTED_OFFER: 'accepted-offer',
  ARY_REQUEST: 'ary-request',
};

// Findings that genuinely cannot be written down. A booking path that dead-ends
// is a sequence of screens; a missing phone number is a sentence.
const VISUAL = /\b(flow|journey|steps?|walk ?through|dead ?end|loops? back|redirect|broken (?:link|form|button|checkout)|does ?n[o']t submit|fails? (?:to )?(?:load|submit|send)|on mobile|scroll|layout|overlap|cut off|hidden behind)\b/i;

// Things somebody will forward internally or read away from the inbox.
const NEEDS_LAYOUT = /\b(compare|comparison|side by side|table|pricing|proposal|breakdown of (?:the )?(?:costs?|options?)|for (?:your|the) (?:team|partner|accountant|board))\b/i;

const WANTS_CALL = /\b(call|zoom|meet|chat|hop on|book (?:a|some) time|talk (?:it )?through)\b/i;

// One promise, one rung.
//
// `findings` is how many separate things were promised; `promise` is the text
// recorded at send time, which is why it was recorded.
export function chooseRung({ promise = '', findings = 1, visual = null, arySaid = null } = {}) {
  // An explicit human choice wins. This is the manual-request path and it is
  // not second-guessed.
  if (arySaid && LADDER.includes(arySaid)) {
    return { rung: arySaid, reason: 'Ary chose this one.', forced: true };
  }

  const text = String(promise || '');
  const n = Number(findings) || 1;

  if (WANTS_CALL.test(text)) {
    return { rung: RUNG.LIVE_AUDIT, reason: 'They asked to talk, not to be sent something.' };
  }

  // `visual` is the caller's own judgement where it has one. Falling back to
  // the text keeps this deterministic rather than asking a model.
  const isVisual = visual === null ? VISUAL.test(text) : Boolean(visual);
  if (isVisual) {
    return { rung: RUNG.VIDEO, reason: 'The finding is a sequence of screens, which a paragraph cannot show.' };
  }

  if (NEEDS_LAYOUT.test(text)) {
    return { rung: RUNG.PDF, reason: 'It needs layout, or they will pass it on to somebody else.' };
  }

  if (n > 2) {
    return { rung: RUNG.RUNDOWN, reason: `${n} separate points, still readable in an email.` };
  }

  return { rung: RUNG.PLAIN_TEXT, reason: 'It fits in the reply. Anything more adds a step between them and the point.' };
}

// May an asset be produced for this prospect at all?
//
// This is the rule that retires cold video and the step-five PDF. Reaching a
// sequence step is not a trigger and cannot be made into one: there is no
// argument here that takes a step number.
export function assetAllowed({ trigger = null, offerAccepted = false, aryRequested = false } = {}) {
  if (aryRequested || trigger === ASSET_TRIGGER.ARY_REQUEST) {
    return { ok: true, trigger: ASSET_TRIGGER.ARY_REQUEST, reason: 'Ary asked for it.' };
  }
  if (offerAccepted && trigger === ASSET_TRIGGER.ACCEPTED_OFFER) {
    return { ok: true, trigger: ASSET_TRIGGER.ACCEPTED_OFFER, reason: 'They accepted the offer this fulfils.' };
  }
  return {
    ok: false,
    trigger: null,
    reason: 'Assets are fulfilment. Nothing is made until somebody asks for it or Ary calls for it.',
  };
}

// The whole decision, so no caller has to remember to ask both questions.
export function fulfilmentFor(prospect = {}, { promise = null, findings = 1, visual = null, arySaid = null, aryRequested = false } = {}) {
  const accepted = Boolean(prospect.offer_accepted_at);
  const gate = assetAllowed({
    trigger: aryRequested ? ASSET_TRIGGER.ARY_REQUEST : ASSET_TRIGGER.ACCEPTED_OFFER,
    offerAccepted: accepted,
    aryRequested,
  });
  if (!gate.ok) return { ...gate, rung: null };

  const chosen = chooseRung({
    promise: promise ?? prospect.promise_made ?? '',
    findings,
    visual,
    arySaid,
  });
  return { ...gate, ...chosen };
}
