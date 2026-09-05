// Ellen's Dream Client Checklist, computed from an Instagram profile.
//
// The rubric is hers (July 2026). Three must-haves are pass/fail, then
// seven revenue signals score a point each and 2+ qualifies. This module
// scores what the profile data can honestly answer and says plainly which
// checks a human still has to make. It never guesses to fill a box.

const COACH_WORDS = [
  'coach', 'coaching', 'mentor', 'mentoring', 'consultant', 'consulting',
  'strategist', 'advisor', 'therapist', 'attorney', 'lawyer', 'dietitian',
  'nutritionist', 'architect', 'founder', 'ceo',
];

const OFFER_WORDS = [
  'program', 'programme', 'mastermind', 'cohort', 'academy', 'bootcamp',
  'course', 'accelerator', 'membership', 'intensive', 'certification',
  'masterclass', 'workshop', 'framework', 'method', 'system',
];

// Link-in-bio services: a page of more socials, not a place to buy.
const LINKTREE_HOSTS = [
  'linktr.ee', 'linkin.bio', 'beacons.ai', 'lnk.bio', 'linkpop.com',
  'campsite.bio', 'milkshake.app', 'shorby.com', 'bio.link', 'solo.to',
  'komi.io', 'later.com', 'flowcode.com', 'allmylinks.com',
];

const INCOME_WORDS = [
  '6 figure', '6-figure', 'six figure', 'six-figure', '7 figure', '7-figure',
  'seven figure', 'seven-figure', 'multi 6', 'multi-6', '$10k', '$20k', '$50k',
  '$100k', '10k months', '10k month', 'k months', 'revenue',
];

const PRICE_WORDS = ['$2,0', '$2k', '$3k', '$5k', '$10k', '$15k', '$20k', 'investment starts', 'starting at $'];
const TEAM_WORDS = ['my team', 'our team', 'team of', 'we help', 'we work with', 'va ', 'assistant'];
const PROOF_WORDS = ['testimonial', 'client results', 'case study', 'success story', 'results', 'wins', 'before and after'];
const PRODUCTION_WORDS = ['podcast', 'host of', 'speaker', 'keynote', 'as seen', 'featured in', 'tedx', 'author of', 'published'];

function hay(profile) {
  const captions = (profile?.latestPosts || [])
    .map((p) => p?.caption || '')
    .join(' ');
  return `${profile?.biography || ''} ${profile?.fullName || ''} ${profile?.businessCategoryName || ''} ${captions}`.toLowerCase();
}

function hasAny(text, words) {
  return words.some((w) => text.includes(w));
}

// Real engagement, not a dead account: her words were "not 5k followers
// with 3 likes per post". Below 1% is the usual dead-account line, but a
// small account with 40 likes on 1,200 followers is clearly alive, so a
// floor of 15 average likes passes too.
export function engagementOf(profile) {
  const posts = (profile?.latestPosts || []).filter((p) => p && typeof p.likesCount === 'number');
  if (!posts.length) {
    // The discovery actor returns captions without per-post like counts but
    // computes an average itself. Using it keeps a live account from reading
    // as dead purely because the like counts arrived in a different field.
    const given = Number(profile?.avgLikes);
    if (Number.isFinite(given) && given > 0) {
      const followers = Number(profile?.followersCount) || 0;
      const rate = followers > 0 ? given / followers : null;
      return { avgLikes: Math.round(given), rate, alive: given >= 15 || (rate != null && rate >= 0.01) };
    }
    return { avgLikes: null, rate: null, alive: null };
  }
  const avgLikes = posts.reduce((n, p) => n + (p.likesCount || 0), 0) / posts.length;
  const followers = Number(profile?.followersCount) || 0;
  const rate = followers > 0 ? avgLikes / followers : null;
  const alive = avgLikes >= 15 || (rate != null && rate >= 0.01);
  return { avgLikes: Math.round(avgLikes), rate, alive };
}

export function scoreProfile(profile) {
  const text = hay(profile);
  const followers = Number(profile?.followersCount) || 0;
  const eng = engagementOf(profile);

  const url = String(profile?.externalUrl || '').toLowerCase();
  const hasLink = Boolean(url);
  const isLinktree = hasLink && LINKTREE_HOSTS.some((h) => url.includes(h));

  // ── Must-haves (all three required) ────────────────────────────────
  const mustHaves = {
    audience: {
      pass: followers >= 1000 && eng.alive === true,
      label: '1,000+ followers with real engagement',
      detail: followers >= 1000
        ? (eng.alive === true
            ? `${followers.toLocaleString()} followers, ~${eng.avgLikes} likes a post`
            : eng.alive === false
              ? `${followers.toLocaleString()} followers but only ~${eng.avgLikes} likes a post`
              : `${followers.toLocaleString()} followers, no recent posts to judge engagement`)
        : `${followers.toLocaleString()} followers`,
    },
    identity: {
      pass: hasAny(text, COACH_WORDS) && hasLink && !isLinktree,
      label: 'Coach or business owner, bio link goes somewhere you can buy',
      detail: !hasAny(text, COACH_WORDS)
        ? 'Bio does not say coach, consultant or similar'
        : !hasLink
          ? 'No link in bio'
          : isLinktree
            ? 'Bio link is a linktree of socials'
            : 'Bio reads as a business, link goes to a real page',
    },
    offer: {
      pass: hasAny(text, OFFER_WORDS),
      label: 'A named, structured offer',
      detail: hasAny(text, OFFER_WORDS)
        ? 'Names a program, cohort or similar'
        : 'No named program found in the bio or recent posts',
    },
  };
  const mustHavesPass = mustHaves.audience.pass && mustHaves.identity.pass && mustHaves.offer.pass;

  // ── Revenue signals (1 point each, 2+ qualifies) ───────────────────
  // "Running paid ads" is her strongest signal and it cannot be read from
  // Instagram. It stays a human check, and the card links straight to the
  // Ad Library so it takes the 10 seconds she said it takes.
  const signals = [
    { key: 'income', label: 'States their income', hit: hasAny(text, INCOME_WORDS) },
    { key: 'pricing', label: 'High-ticket pricing visible', hit: hasAny(text, PRICE_WORDS) },
    { key: 'proof', label: 'Testimonials or client results', hit: hasAny(text, PROOF_WORDS) || (Number(profile?.highlightReelCount) || 0) >= 3 },
    { key: 'production', label: 'Podcast, PR or speaking', hit: hasAny(text, PRODUCTION_WORDS) },
    { key: 'team', label: 'Mentions a team or VA', hit: hasAny(text, TEAM_WORDS) },
    { key: 'consistency', label: 'Posting for a long time', hit: (Number(profile?.postsCount) || 0) >= 100 },
  ];
  const revenueScore = signals.filter((s) => s.hit).length;

  return {
    mustHaves,
    mustHavesPass,
    signals,
    revenueScore,
    // Her line: must-haves Y and 2+ signals makes the list.
    qualifies: mustHavesPass && revenueScore >= 2,
    // Named so the UI can be honest about what it did not check.
    manualChecks: ['Running paid ads (check the Ad Library)'],
  };
}
