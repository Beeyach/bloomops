// Which outreach angle the evidence actually supports.
//
// Recovered rather than invented. Every playbook below already existed as a
// rule somewhere — in the website-audit skill's angle matching, in the
// prospect-pdf skill's "name the one step worth fixing", or in Ary's own
// findings — and none of it was reachable from the app. What is new is the
// gate: a playbook names the evidence it requires, and the product refuses to
// use one whose evidence is absent.
//
// That refusal is the whole point. A generic prompt handed a prospect will
// always produce an angle; the question is whether the angle is true. So the
// selection is code, and the model only writes sentences about a decision that
// was already made from facts.

import { collectEvidence, evidenceStrength, TIER } from './evidence.mjs';

// The keys the site probe emits. Kept as sets rather than regex so a new
// finding key must be classified deliberately instead of leaking into an
// angle by accident.
export const PLAYBOOK = {
  OWN_FINDING: 'own-finding',
  LEAD_CAPTURE_GAP: 'lead-capture-gap',
  BOOKING_FRICTION: 'booking-friction',
  BROKEN_PATH: 'broken-path',
  MOBILE_FRICTION: 'mobile-friction',
  TRUST_GAP: 'trust-gap',
  FORM_FRICTION: 'form-friction',
  RECENT_SIGNAL: 'recent-signal',
  // A verified problem this workspace does not sell a fix for. Deliberately
  // distinct from NONE: the prospect is fine and the finding is real, and
  // filing them next to the unverified would lose that.
  NOT_OUR_OFFER: 'not-our-offer',
  NONE: 'no-safe-angle',
};

// Bumped when required evidence, exclusions, structure or asset fit change
// materially, so future analysis can tell a bad playbook from an old one.
export const PLAYBOOK_VERSION = 2;

// Ordered strongest first. The first one whose evidence is present wins, which
// makes selection deterministic and explainable: "this angle, because this
// finding".
export const PLAYBOOKS = [
  {
    id: PLAYBOOK.OWN_FINDING,
    label: 'Something you saw yourself',
    when: 'Somebody wrote down a finding after looking at the site.',
    // No key list: a manual finding is whatever she noticed, and she does not
    // write down things she thinks are trivial.
    requires: 'a manual finding on the record',
    keys: null,
    manualOnly: true,
    cta: 'Offer to send the thing you noticed, written out plainly.',
    assetFit: 'Usually email only. You already know what you saw.',
  },
  {
    id: PLAYBOOK.LEAD_CAPTURE_GAP,
    label: 'Enquiries can go missing',
    when: 'A verified problem in the path between wanting to contact them and the message arriving.',
    requires: 'a broken or absent contact path, verified by the site check',
    keys: ['form-broken', 'captcha-broken', 'mailto-form', 'no-contact', 'contact-page-no-form', 'lead-magnet-open', 'quote-form-thin'],
    // Was "where the enquiry path breaks", and the writer said exactly that
    // about a therapist whose contact page lists an email and a phone number.
    // Nothing broke. The finding is that there is no form, and the offer has to
    // be an improvement rather than a diagnosis of a failure nobody measured.
    cta: 'Offer to send a short rundown of how you would make the contact path easier.',
    assetFit: 'Video suits this well: a form that does not submit is worth showing.',
  },
  {
    id: PLAYBOOK.BOOKING_FRICTION,
    label: 'Booking takes more steps than it needs to',
    when: 'A booking path exists and is verifiably awkward or broken.',
    // Deliberately NOT `no-booking`. The website-audit skill is explicit that
    // manual scheduling is often a deliberate choice, and treating its absence
    // as a fault is the fastest way to be told so.
    requires: 'a booking path that is present and verifiably problematic',
    keys: ['booking-is-a-form', 'calendar-not-loading', 'two-schedulers'],
    cta: 'Offer to send the two or three steps you would cut from the booking path.',
    assetFit: 'Video suits this: the steps are the story.',
  },
  {
    id: PLAYBOOK.BROKEN_PATH,
    label: 'Something on the site is broken',
    when: 'Verified dead links, missing images or a dead feed.',
    requires: 'a verified broken element',
    keys: ['dead-links', 'nav-dead-link', 'broken-images', 'dead-image-host', 'dead-feed'],
    cta: 'Point at the one thing, and offer to send exactly where it breaks so they can pass it on.',
    assetFit: 'Video suits this: it is visual by definition.',
  },
  {
    id: PLAYBOOK.MOBILE_FRICTION,
    label: 'The phone version fights the visitor',
    when: 'Verified horizontal overflow on a phone width.',
    requires: 'a measured mobile layout problem',
    keys: ['mobile-overflow'],
    cta: 'Offer to send what you saw at phone width, and the one change you would make.',
    assetFit: 'Video suits this: side by side is the argument.',
  },
  {
    id: PLAYBOOK.TRUST_GAP,
    label: 'The site undermines itself',
    when: 'Verified insecure content or a contact detail that disagrees with itself.',
    requires: 'a verified trust or consistency problem',
    keys: ['insecure', 'mixed-content', 'phone-mismatch'],
    cta: 'Mention the one detail, and offer to send every place it appears so it can be fixed at once.',
    assetFit: 'Email is usually enough. It is a sentence, not a walkthrough.',
  },
  {
    id: PLAYBOOK.FORM_FRICTION,
    label: 'The form asks for a lot',
    when: 'A verified long enquiry form.',
    requires: 'a measured long form',
    keys: ['long-form'],
    cta: 'Offer to send the two or three fields you would cut, and why.',
    assetFit: 'Email is usually enough.',
  },
  {
    id: PLAYBOOK.RECENT_SIGNAL,
    label: 'They did something recently',
    when: 'A timestamped engagement signal, such as watching the audit video.',
    requires: 'a real dated signal, not an assumption',
    keys: null,
    signalOnly: true,
    cta: 'Reference the thing they did, lightly, then offer one small specific next step.',
    assetFit: 'Email only. The asset already exists and they have seen it.',
  },
];

export const byId = (id) => PLAYBOOKS.find((p) => p.id === id) || null;

// Which playbook does this prospect's evidence actually support?
//
// Returns the chosen playbook plus the exact evidence that justified it, so
// the reason can be shown to a person and the generator can be handed facts
// rather than a prospect and a hope.
export function selectPlaybook(p = {}, { now = new Date(), evidence = null, settings = null, fitForPlaybook = null } = {}) {
  const ev = evidence || collectEvidence(p, { now });
  const strength = evidenceStrength(ev);
  // Injected rather than imported, to keep this module free of a circular
  // dependency on workspace-fit, which needs PLAYBOOK from here.
  const fitOf = (id) => (fitForPlaybook && settings ? fitForPlaybook(id, settings) : { fit: 'IN_SCOPE' });
  const outOfScope = [];

  // A manual finding outranks everything the machine noticed. She was looking
  // at the page.
  const manual = ev.filter((e) => e.tier === TIER.MANUAL);
  if (manual.length) {
    return {
      playbook: byId(PLAYBOOK.OWN_FINDING),
      supporting: manual.slice(0, 3),
      why: manual[0].text,
      strength,
    };
  }

  for (const pb of PLAYBOOKS) {
    if (!pb.keys) continue;
    const hits = ev.filter((e) => e.key && pb.keys.includes(e.key));
    if (!hits.length) continue;

    // The evidence supports this angle. Whether this workspace can do anything
    // about it is a separate question, and a real problem somebody else should
    // fix is not a reason to send an email.
    const f = fitOf(pb.id);
    if (f.fit === 'OUT_OF_SCOPE') {
      outOfScope.push({ playbook: pb, hits: hits.slice(0, 2), reason: f.reason });
      continue;
    }
    return { playbook: pb, supporting: hits.slice(0, 3), why: hits[0].text, strength, fit: f.fit };
  }

  // Engagement last: real, dated, and not a fact about their website.
  const engaged = ev.find((e) => e.text && /^They opened|watched/i.test(e.text));
  if (engaged) {
    return { playbook: byId(PLAYBOOK.RECENT_SIGNAL), supporting: [engaged], why: engaged.text, strength };
  }

  // We found something real and cannot help with it. A distinct answer from
  // "nothing here": the prospect is fine, the finding is fine, and the mismatch
  // is ours. Worth saying so rather than filing them next to the unverified.
  if (outOfScope.length) {
    return {
      playbook: { id: PLAYBOOK.NOT_OUR_OFFER, label: 'Real issue, not our offer', cta: null, assetFit: 'Nothing to send.' },
      supporting: outOfScope[0].hits,
      why: `${outOfScope[0].hits[0]?.text || 'A verified problem'}. ${outOfScope[0].reason}`,
      strength,
      fit: 'OUT_OF_SCOPE',
      alsoConsidered: outOfScope.map((o) => o.playbook.id),
    };
  }

  // Nothing that survives being written down. Saying so is the feature: the
  // alternative is a fluent email about a problem nobody verified.
  return {
    playbook: { id: PLAYBOOK.NONE, label: 'No safe angle', cta: null, assetFit: 'Nothing to send yet.' },
    supporting: [],
    why: strength.cosmeticOnly
      ? 'The only verified findings are cosmetic, which is not worth an email on its own.'
      : 'Nothing about this prospect has been verified yet.',
    strength,
  };
}
