// Sending, from the product rather than from a person driving a browser.
//
// Until now the app never sent. A skill did, by typing into Gmail's compose
// window in Ary's own Chrome, which was the right call while nothing about
// sending was proven: it kept the authority inside an account a person
// controls and made every send a thing a person had done.
//
// The cost was that every send needed her at a keyboard, and a machine that
// can prepare fifty emails and send none of them is a machine that has moved
// the bottleneck rather than removed it.
//
// THE SCOPE. `gmail.send` is the narrowest scope that permits
// users.messages.send. Google classifies it as sensitive rather than
// restricted, which makes it a smaller ask than the `gmail.readonly` this app
// already holds: it can send and it cannot read anything. The two together are
// still less than `gmail.modify`, which is why they are requested separately.
//
// Adding it changes the consent screen, so an already-connected mailbox has to
// be reconnected once. That is detectable rather than a 403 at four in the
// morning, because the granted scopes are stored on the account.

export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

// Did the person actually consent to sending?
//
// Checked before anything is attempted, so "you need to reconnect" is a thing
// the product says rather than a thing the operator infers from a failure.
export function hasSendScope(account) {
  return String(account?.scope || '').split(/\s+/).includes(GMAIL_SEND_SCOPE);
}

// ── MIME ─────────────────────────────────────────────────────────────────

// RFC 2047 for anything outside ASCII. A subject with a curly apostrophe is
// common enough that leaving it raw would corrupt real emails.
function headerValue(v) {
  const s = String(v ?? '');
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7E]*$/.test(s)) return s;
  return `=?UTF-8?B?${b64(new TextEncoder().encode(s))}?=`;
}

function b64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

const b64url = (bytes) => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// How long a quoted-printable line may get before it needs a soft break.
//
// The limit in RFC 2045 is 76 characters. Content stops at 73 so that the
// trailing `=` fits, and so that a trailing space turned into `=20` afterwards
// still fits. Cutting it that fine and getting it wrong is how a line ends up
// at 77 and something downstream decides to rewrap the whole message.
const QP_LINE = 73;

// A space or tab at the end of a line does not survive transport, so the last
// one has to be encoded. Anything earlier in the line may stay literal.
function encodeTrailingSpace(line) {
  if (line.endsWith(' ')) return `${line.slice(0, -1)}=20`;
  if (line.endsWith('\t')) return `${line.slice(0, -1)}=09`;
  return line;
}

// Quoted-printable, per RFC 2045 §6.7.
//
// This exists because of a real email. The first message this product ever sent
// natively arrived on a phone broken into ragged lines, breaking mid-sentence
// after "as a request" and "If not,". The body in the database was one clean
// paragraph of 457 characters with no line breaks in it at all, and buildMime
// adds none, so nothing on this side did it.
//
// The header said `Content-Transfer-Encoding: 8bit`. A long line declared 8bit
// is an invitation: the relay has to make the message 7-bit clean on the way
// out, and the cheapest way to do that is to hard-wrap it. It chose 72
// columns. Measured against the original, the breaks landed at 70, 138, 209,
// 280, 350 and 417. Once those newlines are real, the receiving client wraps
// the already-wrapped lines again to the width of a phone, which is the ragged
// result.
//
// Encoding it here removes the reason to touch it. Quoted-printable is 7-bit by
// construction, and its soft breaks (a line ending in `=`) vanish on decode, so
// the client receives one logical line per paragraph and reflows it to whatever
// width the reader is actually holding.
//
// Not base64, which would also have worked: the point of a plain-text email is
// that it is plain text, and a message a person cannot read in its raw form is
// harder to debug and reads differently to a filter.
export function quotedPrintable(text) {
  const bytes = new TextEncoder().encode(String(text ?? ''));
  const lines = [];
  let line = '';

  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i];

    // A paragraph break in the source is a real break and stays one. Only the
    // wrapping inside a paragraph is the machine's business.
    if (b === 0x0d && bytes[i + 1] === 0x0a) {
      lines.push(encodeTrailingSpace(line));
      line = '';
      i += 1;
      continue;
    }
    if (b === 0x0a) {
      lines.push(encodeTrailingSpace(line));
      line = '';
      continue;
    }

    let atom;
    if (b === 0x3d) atom = '=3D';                                   // '=' itself
    else if (b === 0x09 || b === 0x20) atom = String.fromCharCode(b); // tab, space
    else if (b >= 0x21 && b <= 0x7e) atom = String.fromCharCode(b);   // printable ASCII
    else atom = `=${b.toString(16).toUpperCase().padStart(2, '0')}`;  // everything else

    // Never split an =XX triplet across a soft break: the two halves decode to
    // nothing recognisable, which is worse than a long line.
    if (line.length + atom.length > QP_LINE) {
      lines.push(`${line}=`);
      line = '';
    }
    line += atom;
  }

  lines.push(encodeTrailingSpace(line));
  return lines.join('\r\n');
}

// The name a stranger sees before they read a word.
//
// It used to be `operatorName` alone, so the first email this product sent
// arrived from "Ary". A first name with no surname and no company, from an
// address nobody recognises, is the shape of every spam message anybody has
// ever deleted, and it also fails the only job the From line has: telling
// somebody who this is.
//
// Both halves together answer it. "Ary at Bloomwired" is a person, working
// somewhere, and it matches how the emails themselves are written: first
// person, from one human, on behalf of a small business.
//
// Falls back rather than inventing. With only one of the two, that one is used;
// with neither, no display name at all, and the address stands on its own.
// Making up a name for an email going to a stranger is not this function's
// decision to take.
export function senderName({ operatorName = null, businessName = null } = {}) {
  const person = String(operatorName || '').trim();
  const business = String(businessName || '').trim();
  if (person && business) {
    // Already says the business, so do not say it twice.
    if (person.toLowerCase().includes(business.toLowerCase())) return person;
    return `${person} at ${business}`;
  }
  return person || business || null;
}

// A display name is a `phrase`, and RFC 5322 lets a phrase hold bare words but
// not punctuation. "Ary, Bloomwired" unquoted would read as two addresses.
function displayName(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const encoded = headerValue(s);
  // Already RFC 2047, which is an atom and must not be quoted.
  if (encoded !== s) return encoded;
  // eslint-disable-next-line no-useless-escape
  if (/[()<>@,;:\\".\[\]]/.test(s)) return `"${s.replace(/([\\"])/g, '\\$1')}"`;
  return s;
}

// A header value may not contain a newline. Anything that does is either a bug
// or somebody trying to inject headers into an email we are about to send from
// a real business's address.
function safeHeader(name, v) {
  const s = String(v ?? '');
  if (/[\r\n]/.test(s)) throw new Error(`${name} contains a line break, which would inject a header.`);
  return s;
}

const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

// The same words, as the paragraphs they already are.
//
// Generated from the plain text rather than written alongside it, so the two
// parts cannot say different things. There is no styling, no wrapper table, no
// image and nothing to click: a person typing this email in Gmail would produce
// exactly this markup, and anything more would make it look like a mailshot.
export function bodyAsHtml(text) {
  const normalised = String(text ?? '').replace(/\r\n/g, '\n');
  const paragraphs = normalised.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (!paragraphs.length) return '<div></div>';
  return paragraphs
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

// Build the message.
//
// Two parts, and the reason is a screenshot. After the quoted-printable fix the
// body reached Gmail as one logical paragraph with no hard breaks in it at all,
// and Gmail still drew it wrapped at 69 characters inside a box wide enough for
// about 95. The text stopped a third of the way short of the right edge, which
// is what "it doesn't look like a normal email" actually was.
//
// That is Gmail rendering text/plain the way it always has: its own fixed
// column, not the width of the window. Every other email in that inbox is
// multipart with an HTML part, so every other email reflows and this one did
// not. No amount of care in the plain part fixes it, because the plain part was
// never the thing being wrapped wrongly.
//
// So the message carries both, least-rich first as the standard requires. The
// plain text is unchanged and still what a text-only client shows. The HTML is
// the same sentences in <p> tags, generated from that same string. Keeping one
// source is the whole point: the earlier note here worried that two parts would
// be two chances to disagree, and it was right to worry, which is why nobody
// writes the second one by hand.
export function buildMime({
  from, fromName = null, to, subject, body,
  inReplyTo = null, references = null,
  // Only ever passed by a test. A boundary has to be unpredictable in real use
  // and stable when something is asserting on the output.
  boundary = null,
}) {
  // Short enough that the Content-Type header stays inside 78 columns without
  // folding, long enough that it cannot collide with anything in a body.
  const mark = boundary || `=_ltb_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const headers = [
    `From: ${fromName ? `${displayName(safeHeader('From name', fromName))} <${safeHeader('From', from)}>` : safeHeader('From', from)}`,
    `To: ${safeHeader('To', to)}`,
    `Subject: ${headerValue(safeHeader('Subject', subject))}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${mark}"`,
  ];
  if (inReplyTo) {
    headers.push(`In-Reply-To: ${safeHeader('In-Reply-To', inReplyTo)}`);
    headers.push(`References: ${safeHeader('References', references || inReplyTo)}`);
  }

  // CRLF line endings, and the body's own newlines normalised to match, then
  // encoded so no relay has a reason to introduce line breaks of its own.
  const text = String(body || '').replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  const html = bodyAsHtml(text).replace(/\n/g, '\r\n');

  const part = (type, content) => [
    `--${mark}`,
    `Content-Type: ${type}; charset="UTF-8"`,
    // See quotedPrintable above. 8bit here was what let a relay rewrap the
    // body at 72 columns and deliver a broken-looking email.
    'Content-Transfer-Encoding: quoted-printable',
    '',
    quotedPrintable(content),
  ].join('\r\n');

  return [
    headers.join('\r\n'),
    '',
    part('text/plain', text),
    part('text/html', html),
    `--${mark}--`,
    '',
  ].join('\r\n');
}

export const encodeMime = (mime) => b64url(new TextEncoder().encode(mime));

// ── The call ─────────────────────────────────────────────────────────────

export class SendFailed extends Error {
  constructor(message, { status = null, permanent = false, needsReconnect = false } = {}) {
    super(message);
    this.name = 'SendFailed';
    this.status = status;
    this.permanent = permanent;
    this.needsReconnect = needsReconnect;
  }
}

// Send one message and return what the provider called it.
//
// The returned id is the whole point. It is the strongest identity a send can
// have, it is available here and nowhere else in the flow, and throwing it
// away would mean rediscovering the send from the Sent folder later — which
// the product can do, and which is recovery rather than a plan.
export async function sendMessage(accessToken, { mime, threadId = null }) {
  const res = await fetch(SEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: encodeMime(mime), ...(threadId ? { threadId } : {}) }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const detail = data?.error?.message || `HTTP ${res.status}`;
    // 401/403 is consent or scope, and retrying makes it neither better nor
    // worse. 400 is a malformed message, which will be malformed next time.
    const permanent = res.status === 400 || res.status === 401 || res.status === 403;
    const needsReconnect = res.status === 401
      || (res.status === 403 && /insufficient|scope|permission/i.test(detail));
    throw new SendFailed(detail, { status: res.status, permanent, needsReconnect });
  }

  if (!data?.id) {
    // A 200 with no id would mean the message may or may not have gone. Treat
    // it as sent-but-unidentified rather than as a failure, because retrying
    // is the one action that could produce a second email.
    throw new SendFailed('Gmail accepted the message but returned no id.', { permanent: true });
  }

  return { messageId: String(data.id), threadId: data.threadId ? String(data.threadId) : null, labelIds: data.labelIds || [] };
}
