// Which records may be used to answer a question about how the product performs.
//
// Structured history in this database begins on 2026-08-09. Before that date
// prospects have stages, reply flags, notes and send dates, and none of it is
// linked: there is no record of which angle was chosen, what evidence chose it,
// which generator wrote the email, or when it actually went out.
//
// That older data is not wrong and not useless. It is just not causal. Blending
// it into a question like "does this playbook earn replies" produces a number
// with a confident decimal point and no meaning, because most of the rows in it
// never had a playbook at all.
//
// So the boundary is explicit, the default is the clean side of it, and mixing
// the two has to be asked for by name.

// The day the versioned outreach package shipped. Everything from here can, in
// principle, be traced end to end.
export const STRUCTURED_FROM = '2026-08-09';

export const COHORT = {
  // Every link in the chain is present.
  STRUCTURED: 'STRUCTURED',
  // Modern, but something is missing. Usable for questions that do not need
  // the missing part.
  PARTIAL: 'PARTIAL',
  // Predates the structure. Countable, never causal.
  LEGACY: 'LEGACY',
};

// The links, named. A caller asks for the ones its question actually needs
// rather than for a single rigid definition of "good data", because "which
// angles get replies" and "how long from approval to send" need different
// things and neither needs everything.
export const LINK = {
  PACKAGE: 'package',        // an outreach package exists
  GENERATOR: 'generator',    // written by a named generator version
  PLAYBOOK: 'playbook',      // an angle was recorded
  EVIDENCE: 'evidence',      // the evidence behind it was snapshotted
  SEND: 'send',              // it actually went out
  REPLY: 'reply',            // replies are structured events, not a boolean
};

const on = (v) => v !== null && v !== undefined && v !== '';

// What this row actually has. Flags, not a verdict, so a caller can decide.
export function linksOf(row = {}) {
  return {
    [LINK.PACKAGE]: on(row.package_id) || on(row.package_version),
    [LINK.GENERATOR]: on(row.generator_version),
    [LINK.PLAYBOOK]: on(row.playbook),
    [LINK.EVIDENCE]: on(row.evidence_hash),
    // A count of zero is a real answer, not a missing field. Reading it as
    // "absent, so fall back to one" is how a prospect with no send at all
    // would have been filed as fully traced.
    [LINK.SEND]: on(row.first_sent_at) || Number(row.send_count || 0) > 0,
    [LINK.REPLY]: Number(row.reply_event_count || 0) > 0,
  };
}

// Is this row from before the boundary?
export function isLegacy(row = {}) {
  const created = String(row.created_at || row.prospect_created_at || '').slice(0, 10);
  // No date at all is treated as legacy. Assuming modern would be the one
  // mistake that silently contaminates the clean side.
  if (!created) return true;
  return created < STRUCTURED_FROM;
}

// The cohort a row belongs to, given the links a question needs.
//
// `requires` defaults to the full chain. Passing a shorter list is the
// supported way to ask a narrower question: time-to-send needs a package and a
// send and does not care whether anybody replied.
export function cohortOf(row = {}, { requires = [LINK.PACKAGE, LINK.GENERATOR, LINK.PLAYBOOK, LINK.EVIDENCE, LINK.SEND] } = {}) {
  if (isLegacy(row)) {
    return { cohort: COHORT.LEGACY, missing: [], why: `Created before ${STRUCTURED_FROM}, when nothing was linked.` };
  }
  const links = linksOf(row);
  const missing = requires.filter((r) => !links[r]);
  if (!missing.length) return { cohort: COHORT.STRUCTURED, missing: [], why: null };
  return {
    cohort: COHORT.PARTIAL,
    missing,
    why: `Modern record, but no ${missing.join(', ')} recorded.`,
  };
}

// Split a set of rows the way an analysis should read them: the clean cohort
// first, the rest kept and labelled rather than dropped.
//
// Dropping would be the tempting version and the wrong one. A question like
// "how many of this month's prospects reached a send" needs to know the size of
// the partial pile, because that pile IS the answer.
export function split(rows = [], opts = {}) {
  const out = { [COHORT.STRUCTURED]: [], [COHORT.PARTIAL]: [], [COHORT.LEGACY]: [] };
  const reasons = new Map();
  for (const r of rows) {
    const c = cohortOf(r, opts);
    out[c.cohort].push(r);
    for (const m of c.missing) reasons.set(m, (reasons.get(m) || 0) + 1);
  }
  return {
    structured: out[COHORT.STRUCTURED],
    partial: out[COHORT.PARTIAL],
    legacy: out[COHORT.LEGACY],
    total: rows.length,
    // Why rows fell out, biggest cause first. This is the part that tells you
    // what to fix, and it is the reason `split` reports instead of filtering.
    missingCounts: [...reasons.entries()].map(([link, n]) => ({ link, n })).sort((a, b) => b.n - a.n),
  };
}

// One reusable SQL shape for "a prospect with everything attached".
//
// Kept here rather than written out at each call site so the definition of the
// clean cohort lives in exactly one place. Callers add their own WHERE.
export const CHAIN_SELECT = `
  SELECT p.id                AS prospect_id,
         p.workspace,
         p.name, p.stage, p.created_at,
         p.first_client_at,
         p.qualification,
         pk.id               AS package_id,
         pk.version          AS package_version,
         pk.generator_version, pk.playbook, pk.playbook_version,
         pk.evidence_hash, pk.workspace_context_hash, pk.workspace_fit,
         pk.model, pk.status AS package_status,
         pk.reviewed_at, pk.review_outcome,
         (SELECT COUNT(*) FROM send_events s WHERE s.prospect_id = p.id)        AS send_count,
         (SELECT MIN(sent_at) FROM send_events s WHERE s.prospect_id = p.id)    AS first_sent_at,
         (SELECT provider_thread_id FROM send_events s WHERE s.prospect_id = p.id ORDER BY sent_at ASC LIMIT 1) AS first_thread_id,
         (SELECT COUNT(*) FROM reply_events r WHERE r.prospect_id = p.id)       AS reply_event_count,
         (SELECT MIN(occurred_at) FROM reply_events r WHERE r.prospect_id = p.id) AS first_reply_at
    FROM prospects p
    LEFT JOIN outreach_packages pk
      ON pk.prospect_id = p.id
     AND pk.id = (SELECT id FROM outreach_packages x WHERE x.prospect_id = p.id ORDER BY x.version DESC LIMIT 1)
`;

// ── Time-to-* ────────────────────────────────────────────────────────────
// No analytics UI, and deliberately none yet. What this does is prove the
// timestamps line up, so that when somebody does ask, the answer comes from
// stored moments rather than from a reconstruction.

const days = (a, b) => {
  if (!a || !b) return null;
  const t1 = Date.parse(String(a).replace(' ', 'T') + (String(a).length <= 10 ? 'T12:00:00Z' : 'Z'));
  const t2 = Date.parse(String(b).replace(' ', 'T') + (String(b).length <= 10 ? 'T12:00:00Z' : 'Z'));
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return null;
  return (t2 - t1) / 86400000;
};

// Every interval the chain can currently support, with null where a moment was
// never recorded. Null is an answer here, not a failure: it names the exact
// link that is missing for this row.
export function intervals(row = {}) {
  return {
    addedToPrepared: days(row.created_at, row.package_created_at || row.reviewed_at),
    preparedToApproved: days(row.package_created_at, row.reviewed_at),
    approvedToSent: days(row.reviewed_at, row.first_sent_at),
    sentToReplied: days(row.first_sent_at, row.first_reply_at),
    repliedToClient: days(row.first_reply_at, row.first_client_at),
    addedToClient: days(row.created_at, row.first_client_at),
  };
}
