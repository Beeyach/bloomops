// Parses the audit skill's notes into a structured profile. The skill has
// been writing the same template for months — RATING, Business, Platform,
// Tools detected, Likely currency, DEAD-ADDRESS CHECK, then ACTIVITY SIGNALS
// and SITE AUDIT sections with dash bullets — sometimes with emoji in front
// of the headers, sometimes plain. Parsing that template is what turns the
// wall of text into a profile without changing how anything is written, and
// it works retroactively on every note already stored.
//
// Anything the parser does not recognize lands in `leftover`, shown as plain
// notes, so a hand-written aside is never silently dropped.

const FIELD_KEYS = [
  ['rating', 'Rating'],
  ['business', 'Business'],
  ['platform', 'Platform'],
  ['tools detected', 'Tools'],
  ['likely currency', 'Currency'],
  ['dead-address check', 'Dead-address check'],
];

const SECTION_KEYS = [
  ['activity signals', 'Activity signals'],
  ['site audit', 'Site audit'],
];

// Strips emoji and other decoration from the front of a line so "📍 Business:"
// and "Business:" read the same. Deliberately conservative: only leading
// non-letter characters go.
const undecorate = (line) => String(line).replace(/^[^A-Za-z]+/, '');

const statusOf = (raw) => {
  if (/[✅✓]|VERIFIED/i.test(raw)) return 'good';
  if (/[❌✗✘]|BROKEN|FAIL(?!S)/i.test(raw)) return 'bad';
  if (/[⚠️⚠]|PARTIAL|NOT VERIFI/i.test(raw)) return 'warn';
  return null;
};

export function parseAuditNotes(text) {
  const out = { rating: null, fields: [], sections: [], leftover: '' };
  const raw = String(text || '');
  if (!raw.trim()) return out;

  const lines = raw.split('\n');
  const leftover = [];
  let section = null; // current {title, items}
  let field = null; // current {label, value} still accepting continuations

  const flushField = () => { field = null; };

  for (const line of lines) {
    // `bare` exists to MATCH headers ("📍 Business:" reads as "Business:");
    // `content` is what gets kept, because stripping leading non-letters from
    // a continuation line eats real text — "+1 801-425-3362" lost its phone
    // number to exactly that.
    const bare = undecorate(line).trim();
    const content = line.trim();

    // Blank line ends any continuation.
    if (!content) { flushField(); continue; }

    // Section header?
    const sec = SECTION_KEYS.find(([k]) => bare.toLowerCase().replace(/:$/, '') === k);
    if (sec) {
      flushField();
      section = { title: sec[1], items: [] };
      out.sections.push(section);
      continue;
    }

    // Field line? Only outside sections — "Booking:" inside SITE AUDIT is a
    // bullet, not a top-level field.
    if (!section) {
      const m = bare.match(/^([A-Za-z][A-Za-z -]{2,24}?)\s*:\s*(.*)$/);
      const key = m && FIELD_KEYS.find(([k]) => m[1].trim().toLowerCase() === k);
      if (key) {
        if (key[0] === 'rating') {
          out.rating = m[2].trim();
          flushField();
        } else {
          field = { label: key[1], value: m[2].trim() };
          out.fields.push(field);
        }
        continue;
      }
      // Continuation of the field above, or leftover.
      if (field) {
        field.value = `${field.value} ${content}`.trim();
      } else {
        leftover.push(line);
      }
      continue;
    }

    // Inside a section: bullets and their wrapped continuations.
    const bullet = line.trim().match(/^[-•*]\s*(.*)$/);
    if (bullet) {
      const body = bullet[1].trim();
      const lm = undecorate(body).match(/^([A-Za-z][A-Za-z /-]{1,28}?)\s*:\s*(.*)$/);
      // The status icon in the UI carries the verdict now, so a LEADING mark
      // in the text would show twice. Mid-text marks stay — a "⚠️ but the
      // widget could not be confirmed" aside is information.
      const stripLead = (t) => String(t).replace(/^[\s✅✓❌✗✘⚠️✅⚠️]+/u, '');
      section.items.push({
        status: statusOf(body),
        label: lm ? lm[1].trim() : null,
        text: stripLead(lm ? lm[2].trim() : undecorate(body).trim()),
      });
    } else if (section.items.length) {
      const last = section.items[section.items.length - 1];
      last.text = `${last.text} ${content}`.trim();
      // A continuation can carry the verdict mark, e.g. a wrapped "✅ works".
      if (!last.status) last.status = statusOf(line);
    } else {
      leftover.push(line);
    }
  }

  out.leftover = leftover.join('\n').trim();
  return out;
}
