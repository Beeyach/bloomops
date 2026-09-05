// Pulls a contact email off a business's own website.
//
// The Meta Ad Library hands back the page an ad points at but never an email,
// and Ellen contacts by email, so the address has to come from the landing
// page itself. A mailto: link is the strongest signal; failing that, a plain
// address in the page text. Nothing is guessed — no address means no address,
// and the lead still shows as a match.

// Addresses that are never a real contact: placeholders, platform noise, and
// image filenames that happen to look like an email.
const JUNK_EMAIL =
  /@(example\.|sentry\.|wixpress\.|godaddy|squarespace|sentry-next|domain\.com|email\.com|yourdomain|your-?email|test\.com|placeholder)/i;
const JUNK_LOCAL = /^(your-?email|email|name|user|someone|noreply|no-reply|donotreply|do-not-reply)@/i;
const IMAGE_TAIL = /\.(png|jpe?g|gif|webp|svg|css|js)$/i;

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

function plausible(addr) {
  const e = String(addr || '').trim().toLowerCase().replace(/[.,;:)>\]]+$/, '');
  if (!e || e.length > 100) return null;
  if (JUNK_EMAIL.test(e) || JUNK_LOCAL.test(e) || IMAGE_TAIL.test(e)) return null;
  // A local part that is all hex and long is usually a tracking/sentry id.
  if (/^[0-9a-f]{16,}@/.test(e)) return null;
  return e;
}

// Finds the first plausible email in a blob of HTML.
function emailIn(html) {
  for (const m of html.matchAll(/mailto:([^"'?\s>]+)/gi)) {
    const e = plausible(decodeURIComponent(m[1]));
    if (e) return e;
  }
  for (const m of html.matchAll(EMAIL_RE)) {
    const e = plausible(m[0]);
    if (e) return e;
  }
  return null;
}

// The clues that a page is selling something serious, not a cheap download.
//
// None of these is a price tag — real high-ticket hides the number behind a
// call, so it cannot be read off the page. What CAN be read is the shape of the
// offer around it: a structured program, an apply-or-book-a-call funnel, a
// stated income claim, or an actual figure when they do show one. Each is a
// visible clue, surfaced so the operator can judge at a glance rather than open
// every site. Text is lowercased HTML plus whatever ad copy came with it.
const SIGNAL_RULES = [
  {
    key: 'program',
    label: 'Has a program',
    re: /\b(mastermind|accelerator|group coaching|coaching program|group program|cohort|\bacademy\b|mentorship|private coaching|1[-\s]?on[-\s]?1|one[-\s]?on[-\s]?one)\b/i,
  },
  {
    key: 'funnel',
    label: 'Apply / call funnel',
    re: /\b(book a call|schedule a call|discovery call|strategy call|clarity call|book a consultation|apply (now|here|to work)|application|work with (me|us)|enquire|inquire)\b/i,
  },
  {
    key: 'price',
    label: 'Price shown',
    re: /\$\s?\d{1,3}(?:,\d{3})+|\$\s?\d{1,3}\s?k\b|\binvestment (is|starts|of)\b/i,
  },
  {
    key: 'income',
    label: 'Income claim',
    re: /\b(6[-\s]?figure|six[-\s]?figure|7[-\s]?figure|seven[-\s]?figure|multi[-\s]?6|multi[-\s]?six|10k months?|\$?10k\/mo)\b/i,
  },
];

export function signalsInText(text) {
  const hay = String(text || '').toLowerCase();
  return SIGNAL_RULES.filter((r) => r.re.test(hay)).map((r) => ({ key: r.key, label: r.label }));
}

// Fetches a URL once and returns the contact email and the high-ticket clues
// on it. `extraText` is folded into the clue scan, so ad copy that named a
// program or a call funnel counts even when the landing page is thin. Never
// throws: a fetch that fails returns an empty result and the lead still stands.
export async function siteEmailAndSignals(url, { extraText = '', timeoutMs = 8000 } = {}) {
  const target = String(url || '').trim();
  let html = '';
  // Whether the address answered at all, and how. Callers used to get an empty
  // result for "their site has nothing on it" and for "their site does not
  // exist", which are the same shape and cost very different money: two dead
  // 404s went on to buy a browser probe each because nothing downstream could
  // tell the difference.
  let status = null;
  let reachable = false;
  if (target) {
    const withProto = /^https?:\/\//i.test(target) ? target : `https://${target}`;
    try {
      const res = await fetch(withProto, {
        redirect: 'follow',
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
          accept: 'text/html',
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = res.status;
      reachable = res.ok;
      if (res.ok) {
        const buf = await res.arrayBuffer();
        html = new TextDecoder().decode(buf.slice(0, 500_000));
      }
    } catch {
      // Leaves html empty; signals still come from extraText.
    }
  }
  return {
    email: html ? emailIn(html) : null,
    signals: signalsInText(`${html} ${extraText}`),
    reachable,
    status,
    // The page itself, so callers can judge whether a browser probe could
    // learn anything, without paying for a second fetch to find out.
    html,
  };
}

// Is this address worth paying a browser probe for?
//
// A plain fetch and a real browser do not fail for the same reasons. 404 and a
// dead name mean there is nothing there and no amount of browser will find it.
// 403, 429 and the 5xx range mean a bot check or a bad moment, and getting past
// a bot check is precisely what the browser probe is for.
export function worthProbing(status) {
  if (status === null || status === undefined) return false; // never answered
  if (status === 404 || status === 410) return false;
  return true;
}

// Fetches a URL and returns the best contact email, or null. Never throws.
export async function emailFromSite(url, opts) {
  return (await siteEmailAndSignals(url, opts)).email;
}
