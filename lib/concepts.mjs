// The words this product uses about a prospect, and the two facts about each
// that must be identical everywhere.
//
// Two screens explain these concepts and they explain them differently on
// purpose. Start here answers "what does Held mean"; the prospect page answers
// "what is happening with this person". A glossary entry and a status headline
// are not the same sentence and forcing them to be would make one of them read
// like the other.
//
// What they must never disagree about is the classification underneath:
//
//   judgement    is this a conclusion about the business, or a prerequisite
//                nobody has met yet
//   recoverable  can it change without anybody deciding anything
//
// That pair is the whole reason the vocabulary exists. Held drawn like a
// rejection turns 702 reachable businesses into a graveyard; Parked drawn like a
// prerequisite invites somebody to keep spending on a business the rules already
// ruled out. Both screens read those two booleans from here, and a test fails if
// either one contradicts this file.
//
// Deliberately NOT here: any rule that decides which concept applies. That lives
// in verification.mjs, contact-state.mjs, priority.mjs and vet.mjs, and nothing
// in this file may be used to work out what is true about a prospect. This is
// vocabulary, not policy.

export const CONCEPT = {
  STRONG: {
    term: 'Strong',
    short: 'There is a real reason to write to this business.',
    judgement: false,
    recoverable: true,
    // Said out loud because both surfaces have to keep saying it. Strong is an
    // argument for writing, not a forecast, and it is not a claim about money.
    neverImplies: ['a sale', 'ability to pay'],
  },
  EVIDENCE: {
    term: 'Evidence',
    short: 'Something checked, with a note of where it came from.',
    judgement: false,
    recoverable: true,
  },
  GREEN: {
    term: '💚',
    short: 'Worth chasing. Spend more on this one.',
    judgement: false,
    recoverable: true,
    // The rating is a decision about effort. It cannot make anything true.
    neverImplies: ['evidence', 'Strong'],
  },
  CROSS: {
    term: '✖️',
    short: 'Keep the effort low.',
    judgement: false,
    recoverable: true,
    // A cross still allows one email. Do not contact is separate and final.
    neverImplies: ['do not contact'],
  },
  HELD: {
    term: 'Held',
    short: 'Good prospect, no way to reach them yet.',
    judgement: false,
    recoverable: true,
    neverImplies: ['rejection', 'a bad business'],
  },
  PARKED: {
    term: 'Parked',
    short: 'A decision about the prospect stopped the pipeline.',
    // The only concept in this file that is a conclusion about the business.
    judgement: true,
    recoverable: false,
  },
  DEFERRED: {
    term: 'Deferred',
    short: 'You chose to come back to them later.',
    judgement: false,
    recoverable: true,
  },
  PRIORITY: {
    term: 'Priority',
    short: 'The most emails this person may ever receive.',
    judgement: false,
    recoverable: true,
  },
  DRAFT: {
    term: 'Draft',
    short: 'Written, not sent, not seen by anyone but you.',
    judgement: false,
    recoverable: true,
  },
  WATCHING: {
    term: 'Watching only',
    short: 'The app works out what it would do, and does nothing.',
    judgement: false,
    recoverable: true,
  },
  AUTOMATION_STOPPED: {
    term: 'Automation stopped',
    short: 'A background job could not finish.',
    judgement: false,
    recoverable: true,
  },
};

export const conceptFor = (key) => CONCEPT[key] || null;

// Every concept, for anything that needs to walk them.
export const CONCEPTS = Object.entries(CONCEPT).map(([key, c]) => ({ key, ...c }));

// Is this concept a conclusion about the business?
//
// The one question a screen has to get right before it picks a colour.
export const isJudgement = (key) => Boolean(CONCEPT[key]?.judgement);
