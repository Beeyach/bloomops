// The only shape the safety engine is allowed to see.
//
// Written after a bug that had the approval queue refusing every package for a
// week. The query aliased `p.email AS prospect_email` so it would not collide
// with the package's own email columns, then handed that row straight to
// `canProgressOutbound`, which reads `p.email`. The guard found no address and
// blocked everything, displaying the address it claimed not to have on the
// line below.
//
// Nothing failed. `p.email` on an object without that key is `undefined`, and
// `undefined` is indistinguishable from "this prospect has no email address".
// The guard answered a question about a prospect that did not exist.
//
// The same omission hid `do_not_contact` and `unsubscribed`, and that half
// fails OPEN: a package for somebody who had unsubscribed would not have been
// blocked. A guard that silently sees fewer fields than it reads is worse than
// no guard, because it looks like one.
//
// So the guard no longer takes a database row. It takes this, and building one
// from an incomplete row throws.

// Every field the outbound guard reads. Adding a condition to the guard means
// adding its field here, and a query that forgot it fails loudly at the
// boundary rather than quietly inside the decision.
export const GUARD_FIELDS = [
  'id',
  'name',
  'business_name',
  'email',
  'stage',
  'replied',
  'reply_type',
  'reply_date',
  'last_contact_date',
  'next_action_date',
  'do_not_contact',
  'unsubscribed',
  // Which send window governs them. Not a consent field: it decides WHEN a
  // send is allowed, never WHETHER. Listed here because the guard reads it,
  // and a field the guard reads belongs in this list by the rule above.
  'country',
];

// Fields a caller may legitimately not have, because they are not always
// selected and the guard treats absence and null identically for them.
//
// `country` is optional on purpose. Absent and null genuinely mean the same
// thing for it: no region is known, so the workspace window applies, which is
// what happened for every prospect before region scopes were wired up. Making
// it required would throw inside a live send path on any of the six callers
// whose query does not select it, and a politeness question is not worth
// failing a send over.
const OPTIONAL = new Set(['name', 'business_name', 'country']);

export class IncompleteProspect extends Error {
  constructor(missing, where) {
    super(
      `The outbound guard was given a row without ${missing.join(', ')}${where ? ` (${where})` : ''}. `
      + 'A missing column is not an empty value: the guard would have answered about a prospect that does not exist.'
    );
    this.name = 'IncompleteProspect';
    this.missing = missing;
  }
}

// Build the guard's view of a prospect from a database row.
//
// `aliases` maps a guard field to the column it actually arrived under, which
// is the specific thing that broke: a query is entitled to alias a column, and
// the aliasing has to be undone somewhere. Here, once, explicitly.
//
// Presence is tested with `in`, not truthiness. `email: null` is a prospect
// with no address, which the guard should stop on. A row with no `email` key at
// all is a query that forgot to select it, which is a bug, and the two must
// never produce the same answer.
export function guardView(row, { aliases = {}, where = null } = {}) {
  if (!row || typeof row !== 'object') throw new IncompleteProspect(GUARD_FIELDS, where);

  const out = {};
  const missing = [];
  for (const field of GUARD_FIELDS) {
    const from = aliases[field] || field;
    if (from in row) {
      out[field] = row[from];
    } else if (OPTIONAL.has(field)) {
      out[field] = null;
    } else {
      missing.push(field);
    }
  }
  if (missing.length) throw new IncompleteProspect(missing, where);

  // A marker the guard can check, so a raw row passed by a future caller is
  // caught rather than silently accepted.
  Object.defineProperty(out, GUARD_MARK, { value: true, enumerable: false });
  return out;
}

export const GUARD_MARK = Symbol.for('bloom.guardView');

export const isGuardView = (p) => Boolean(p && p[GUARD_MARK]);

// The columns a query must select to be able to build one. Interpolated into
// SQL so the list cannot drift from GUARD_FIELDS.
export const GUARD_SELECT = GUARD_FIELDS.map((f) => `p.${f}`).join(', ');
