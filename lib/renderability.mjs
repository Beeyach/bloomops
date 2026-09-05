// Can this site be meaningfully inspected at all?
//
// Deliberately a different question from "is this a good prospect". A site we
// cannot read is not a bad business, it is a business we cannot currently
// verify from its website, and turning one into the other is how a real
// prospect gets binned for having a Cloudflare rule.
//
// Runs on the HTML the free signals stage already fetched, so it costs no
// extra request. That matters: the point is to spend nothing deciding whether
// to spend twenty credits.
//
// Written after measuring the three sites that had been marked unreadable in
// production. All three were fine. The failure was ours, in the paid probe,
// and this exists to catch the genuine cases without inventing more.

export const RENDER = {
  RENDERABLE: 'RENDERABLE',
  EMPTY: 'EMPTY',
  BLOCKED: 'BLOCKED',
  CHALLENGE: 'CHALLENGE',
  DEAD: 'DEAD',
  PLACEHOLDER: 'PLACEHOLDER',
  UNKNOWN: 'UNKNOWN',
};

// Verdicts where paying for a browser probe cannot produce evidence.
export const NOT_WORTH_PROBING = new Set([RENDER.DEAD, RENDER.PLACEHOLDER, RENDER.EMPTY]);

// A challenge is a PAGE, not a script tag.
//
// The first version of this matched `recaptcha` and `__cf_bm` anywhere in the
// source, which fires on any ordinary site with a contact form or a Cloudflare
// proxy in front of it. Both of the real sites tested tripped it while being
// perfectly readable. These patterns describe what an interstitial actually
// says, and are checked against the visible text and title only.
const CHALLENGE_TEXT = /checking your browser before|enable javascript and cookies to continue|verify you are (a )?human|please (complete|verify) the security check|attention required!? *\| *cloudflare|one more step before|ddos protection by|access denied.{0,40}(cloudflare|akamai|incapsula)/i;
const CHALLENGE_TITLE = /^(just a moment|attention required|access denied|security check|are you (a )?human)/i;

// Registrar and host placeholders. A page can answer 200 and not be a website.
const PLACEHOLDER_TEXT = /domain (is )?(for sale|parked)|buy this domain|this domain is parked|future home of|website coming soon|under construction|default web ?page|sedoparking|parkingcrew|hugedomains|afternic/i;

const LOGIN_WALL = /^(sign in|log ?in|members? area)/i;

const squash = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// Text a reader would see, from raw HTML. Scripts, styles and markup removed.
export function visibleTextOf(html) {
  return squash(
    String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<template[\s\S]*?<\/template>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;?/gi, ' ')
      .replace(/&[a-z#0-9]+;/gi, ' ')
  );
}

export function titleOf(html) {
  return squash((String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
}

// How much text a page needs before it is worth a browser.
//
// Set from measurement, not taste: the three sites wrongly rejected in
// production carried 5,397, 8,844 and 10,157 characters. A registrar
// placeholder carries a couple of hundred at most. 400 sits well clear of
// both, and anything between is sent to the probe rather than judged here,
// because the browser is the thing that can actually tell.
export const MIN_TEXT = 400;
export const MIN_LINKS = 3;

export function classifyRenderability({ status = null, html = '', finalUrl = '', error = null } = {}) {
  const say = (verdict, reason, extra = {}) => ({ verdict, reason, ...extra });

  // Never answered. DNS failure, refused connection, timeout.
  if (error || status === null) {
    return say(RENDER.DEAD, error ? `The address did not answer (${String(error).slice(0, 60)}).` : 'The address did not answer.');
  }
  if (status === 404 || status === 410) return say(RENDER.DEAD, `The address answered ${status}.`);

  const text = visibleTextOf(html);
  const title = titleOf(html);
  const links = (String(html).match(/<a\s[^>]*href=/gi) || []).length;

  // A challenge is checked before the status code, because interstitials are
  // served under every code there is: 200, 403, 429 and 503 all turn up. What
  // identifies one is the page, and naming it correctly is what tells a person
  // "a browser will probably get in" rather than "their server is down".
  const looksChallenged = CHALLENGE_TITLE.test(title) || CHALLENGE_TEXT.test(text.slice(0, 1200));
  if (looksChallenged) {
    return say(RENDER.CHALLENGE, 'A bot check answered instead of the site. A real browser may still get through.', { title });
  }
  if (status >= 500) return say(RENDER.BLOCKED, `Their server answered ${status}, so nothing could be read right now.`);
  if (status === 403 || status === 401 || status === 429) {
    return say(RENDER.BLOCKED, `Their site answered ${status} to a plain request. A real browser may still get through.`);
  }

  if (PLACEHOLDER_TEXT.test(text.slice(0, 600))) {
    return say(RENDER.PLACEHOLDER, 'This address is a placeholder or parking page, not their website.', { title });
  }

  // Genuinely nothing there. Both signals required: a real business page has
  // hundreds of characters and a nav even when it is one page long.
  if (text.length < MIN_TEXT && links < MIN_LINKS) {
    // The distinction that saved three prospects: almost no text but plenty of
    // links, or vice versa, is a page a browser will very likely render fine.
    return say(RENDER.EMPTY, 'The page came back with almost nothing on it.', { textLength: text.length, links });
  }

  if (LOGIN_WALL.test(title)) {
    return say(RENDER.UNKNOWN, 'The address leads to a sign-in page, so there may be nothing public to look at.', { title });
  }

  if (!html) return say(RENDER.UNKNOWN, 'Nothing came back to read.');

  return say(RENDER.RENDERABLE, 'There is a real page here to look at.', { textLength: text.length, links, title });
}

// The one-line answer the paid stage needs.
export function shouldProbe(verdict) {
  return !NOT_WORTH_PROBING.has(verdict);
}
