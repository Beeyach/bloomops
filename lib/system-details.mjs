// The technical record, gathered in one place so it can be got out of the way.
//
// None of these values are deleted, and none of them are wrong. They are simply
// not what somebody is asking when they open a prospect. "FINGERPRINT_STALE"
// and "prospect 4471, package 14, provider thread 199c…" are the right answer
// to "why did this not send", and the wrong answer to every other question,
// which is most of them.
//
// So they live behind one closed disclosure, built from one list, and the rest
// of the page is written in words. Rows with no value are dropped rather than
// printed as em dashes: a screen of empty labels is not disclosure, it is
// wallpaper.

const rows = (pairs) => pairs
  .filter(([, v]) => v !== null && v !== undefined && v !== '')
  .map(([label, value]) => ({ label, value: String(value) }));

// Everything about the prospect record itself.
export function recordDetails(p = {}, state = null) {
  const s = state?.schedule || {};
  return rows([
    ['Prospect id', p.id],
    ['Internal stage', p.stage],
    ['Action pile', state?.pile],
    ['Action label', state?.label],
    ['Schedule status', s.status],
    ['Schedule decision', s.decision],
    ['Schedule reason', s.reason],
    ['Email 1 anchor', s.anchor],
    ['Anchor source', s.anchorSource],
    ['Next step', s.step],
    ['Due at', s.dueAt],
    ['Priority band', p.priority_band],
    ['Band provisional', p.band_was_provisional ? '1' : null],
    ['Ceiling', state?.ceiling],
    ['Emails sent', p.emails_sent],
    ['Contact state', p.contact_state],
    ['Contact state reason', p.contact_state_reason],
    ['Verification state', p.verification_state],
    ['Verification reason', p.verification_reason],
    ['Origin class', p.origin_class],
    ['Origin batch', p.origin_batch],
    ['Source provider', p.source_provider],
    ['Source', p.source],
    ['Site check source', p.site_intel_source],
    ['Pending draft stale', p.pending_draft_stale ? '1' : null],
    ['Do not contact', p.do_not_contact ? '1' : null],
    ['Unsubscribed', p.unsubscribed ? '1' : null],
    ['Deferred until', p.deferred_until],
    ['Created at', p.created_at],
    ['Updated at', p.updated_at],
  ]);
}

// One send, as the provider and the queue recorded it.
export function sendDetails(send = {}) {
  return rows([
    ['Send event id', send.id],
    ['Sequence step', send.sequence_step],
    ['Sent at', send.sent_at],
    ['Recorded via', send.recorded_via],
    ['Channel', send.channel],
    ['Provider', send.provider],
    ['Provider message id', send.provider_message_id],
    ['Provider thread id', send.provider_thread_id],
    ['Package id', send.package_id],
    ['Package version', send.package_version],
    ['Playbook', send.playbook],
    ['Approval fingerprint', send.approval_fingerprint],
    ['Sent by', send.sent_by],
    ['Prepared by', send.prepared_by],
  ]);
}

export function packageDetails(pkg = {}) {
  return rows([
    ['Package id', pkg.id],
    ['Version', pkg.version],
    ['Status', pkg.status],
    ['Status reason', pkg.status_reason],
    ['Playbook', pkg.playbook],
    ['Generator version', pkg.generator_version],
    ['Approved fingerprint', pkg.approved_fingerprint],
    ['Created at', pkg.created_at],
    ['Updated at', pkg.updated_at],
  ]);
}

export function jobDetails(job = {}) {
  return rows([
    ['Job id', job.id],
    ['Kind', job.kind],
    ['Queue status', job.status],
    ['Attempts', job.attempts],
    ['Error kind', job.error_kind],
    ['Last error', job.last_error],
    ['Updated at', job.updated_at],
  ]);
}

// The whole disclosure, as titled groups. Empty groups never render.
export function systemDetails(prospect = {}, {
  state = null, sends = [], packages = [], jobs = [],
} = {}) {
  const groups = [{ title: 'Record', rows: recordDetails(prospect, state) }];

  for (const s of sends) {
    groups.push({ title: `Send · step ${s.sequence_step ?? '?'}`, rows: sendDetails(s) });
  }
  for (const p of packages) {
    groups.push({ title: `Package ${p.id}`, rows: packageDetails(p) });
  }
  for (const j of jobs) {
    groups.push({ title: `Job · ${j.kind || 'unknown'}`, rows: jobDetails(j) });
  }

  return groups.filter((g) => g.rows.length > 0);
}
