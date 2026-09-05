'use client';

import { useEffect, useState, useCallback } from 'react';
import { Icon } from './Icons';
import { toast } from '@/lib/toast.mjs';
import { BUCKET_BY_ID, PREVIEW, sectionView, viewAllLabel } from '@/lib/today-buckets.mjs';
import { approvalCard, CARD } from '@/lib/approval.mjs';
import { LATE_FOLLOWUP_SHAPE, LATE_FOLLOWUP_STEP } from '@/lib/late-followup.mjs';
import BloomSpinner from './BloomSpinner';

// Reviewing prepared outreach, several at a time.
//
// The job here is throughput, not presentation. Ary is deciding "is this true
// and does it sound like me", which is a two-second judgement per prospect
// given the right three lines, and a two-minute one if she has to open a
// drawer to find them. So everything needed for the decision is on the row,
// and everything else is behind a disclosure.
//
// Deliberately not a separate dashboard. It hangs off the Ready for approval
// section in Today, because a second place to look is a place that gets
// forgotten.

const PLAYBOOK_LABEL = {
  'own-finding': 'You spotted it',
  'lead-capture-gap': 'Enquiries can go missing',
  'booking-friction': 'Booking friction',
  'broken-path': 'Something is broken',
  'mobile-friction': 'Phone layout',
  'trust-gap': 'Trust gap',
  'form-friction': 'Long form',
  'recent-signal': 'Recent signal',
};

const CTA_LABEL = {
  MICRO_OFFER: 'offers something specific',
  OPEN_QUESTION: 'ends on an open question',
  OTHER: 'no clear next step',
};

const RATING_CHOICES = [
  { value: '💚', label: '💚 worth chasing' },
  { value: '', label: 'no call yet' },
  { value: '✖️', label: '✖️ they will say no' },
];

const ASSET_PILL = {
  PDF_RECOMMENDED: { text: 'PDF worth it', tone: 'good' },
  PDF_OPTIONAL: { text: 'PDF optional', tone: 'soft' },
  VIDEO_RECOMMENDED: { text: 'Video worth it', tone: 'good' },
  VIDEO_OPTIONAL: { text: 'Video optional', tone: 'soft' },
};

export default function ApprovalQueue({ onOpen, onViewAll = null, full = false, initialData = null, previewLimit = PREVIEW, onCount = null, hideHeader = false }) {
  // `initialData` is a seam for rendering this without a browser. Effects do
  // not run during server rendering, so a component that only ever learns
  // anything from a fetch renders as whatever it starts as, and a test that
  // could not seed it could only ever assert the loading state. That is
  // precisely how "the heading is missing when packages exist" went unnoticed.
  const [data, setData] = useState(initialData);
  const [loadError, setLoadError] = useState(null);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(null);
  const [edits, setEdits] = useState({});
  // The rating Ary is trying on, before she commits it. Changing it changes the
  // band, which changes how many emails this one approval authorises, so the
  // panel below recomputes from it rather than from what is on the record.
  const [ratings, setRatings] = useState({});
  // The internal fields, collapsed. A card that leads with credits and
  // priority codes is an engineering dashboard.
  const [details, setDetails] = useState(null);
  // The batch review of the late-follow-up set: whether the one-tap approval
  // is running, and which row's exact draft is open to read.
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchRead, setBatchRead] = useState(null);

  const [shownCount, setShownCount] = useState(full ? 25 : previewLimit);

  const load = useCallback(() => {
    setLoadError(null);
    fetch(`/api/outreach?limit=${full ? 200 : 60}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setData(d))
      .catch(() => setLoadError('New outreach could not be loaded. Nothing was sent or changed.'));
  }, [full]);
  useEffect(() => { load(); }, [load]);

  // Chapter 9: Today labels the Approvals tab without rendering the cards,
  // so the count has to come back up. Same payload, no extra request.
  useEffect(() => {
    if (data && onCount) onCount(Number(data.total ?? (data.items || []).length) || 0);
  }, [data, onCount]);

  const def = BUCKET_BY_ID.approvals;
  const s = data
    ? sectionView(def, { items: data.items || [], total: data.total, limit: shownCount })
    : null;

  const Header = () => (
    full || hideHeader ? null : (
      <div className="flex items-start justify-between gap-3 flex-wrap mt-6 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 ui-body font-semibold text-mauve-deep">
            <Icon name="check-circle" className="w-3.5 h-3.5" />
            {def.title}
            <span className="text-ink-3 font-normal tabular-nums">{s ? s.total : '…'}</span>
          </div>
          <p className="ui-small text-ink-2 mt-0.5">{def.blurb}</p>
        </div>
        {s && viewAllLabel(s) && onViewAll && (
          <button
            onClick={() => onViewAll(def.view)}
            className="shrink-0 ui-small font-semibold text-rose-text hover:underline"
          >
            {viewAllLabel(s)} →
          </button>
        )}
      </div>
    )
  );

  // The heading is visible while the endpoint loads and when it fails. A
  // runtime problem must never make the whole section look as if it vanished.
  if (!data) {
    return (
      <section className="mt-6" aria-label="Ready for approval">
        <Header />
        <div className="ui-body text-ink-2 border border-line r-lg bg-panel px-4 py-3 flex items-center gap-3 flex-wrap">
          <span>{loadError || 'Checking for new outreach…'}</span>
          {loadError && (
            <button onClick={load} className="ui-small font-medium px-3 py-1.5 r-md btn-retry-quiet transition">
              Retry
            </button>
          )}
        </div>
      </section>
    );
  }

  // Rendered even when there is nothing, saying so.
  if (!data.items?.length) {
    return (
      <section>
        <Header />
        <p className="ui-body text-ink-3 border border-line r-lg bg-panel px-4 py-3">
          {def.empty}
        </p>
      </section>
    );
  }

  // Sending, by hand. The same path the scheduler uses, so there is one
  // sending system, and it says exactly what it did.
  const send = async (item) => {
    setBusy(item.id);
    try {
      const r = await (await fetch('/api/outreach', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, action: 'send' }),
      })).json();
      if (r.ok && r.sent) {
        toast(`Sent to ${item.contact?.email}.`, { tone: 'success' });
        setData((d) => ({ ...d, items: d.items.filter((x) => x.id !== item.id) }));
      } else {
        toast(r.reason || r.error || 'That did not send.', { tone: 'error' });
        load();
      }
    } catch {
      toast('That did not send.', { tone: 'error' });
    }
    setBusy(null);
  };

  const act = async (item, action, extra = {}) => {
    setBusy(item.id);
    try {
      const r = await (await fetch('/api/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, action, ...extra }),
      })).json();
      if (r.ok) {
        toast(
          action === 'approve'
            // Which consent was just given, said back. "Approved" alone cannot
            // tell one email from a whole sequence.
            ? (r.sequenceApproved
              ? `Approved all ${r.allowedLength || ''} emails`.replace('  ', ' ')
              : (r.outcome === 'EDITED' ? 'Approved with your edits' : 'Approved the first email'))
            : action === 'research' ? 'Sent back for more research' : 'Skipped',
          { tone: 'success' }
        );
        // Approving is not finishing. The card stays, now offering the send,
        // because the email still has to be sent by hand while automatic
        // sending is off. Removing it here made the approved package vanish
        // off the screen, which is exactly what the old code did and exactly
        // what left copying into Gmail as the only way to finish.
        setData((d) => (action === 'approve'
          // The sequence flag comes back from the route rather than being
          // assumed here, or the card would keep asking for a consent that had
          // just been given.
          ? { ...d, items: d.items.map((x) => (x.id === item.id ? { ...x, status: 'APPROVED', sequenceApproved: r.sequenceApproved === true } : x)) }
          : { ...d, items: d.items.filter((x) => x.id !== item.id) }));
        setOpen(null);
      } else {
        // The commonest failure is the one worth spelling out: they replied.
        toast(r.reason || r.error || 'That did not go through.', { tone: 'error' });
        load();
      }
    } catch {
      toast('That did not go through.', { tone: 'error' });
    }
    setBusy(null);
  };

  const visible = s.preview;
  // An approved package belongs with the cards, not with the problems. It has
  // been read and decided; what it is waiting for is the send. Sorting it into
  // the other pile rendered it as a bare name over "Open prospect", with no
  // sign that anything was approved and no way to send it.
  //
  // The same thing happened one step later, to sequences. A package is SENT
  // once its first email has gone, so a sequence-approved package with a
  // follow-up still owed landed in the problem pile too — a bare name over
  // "Open prospect", no sign an approved email was waiting, and nothing to
  // press. That is what Ary saw when she went looking for the threading canary.
  const ACTIONABLE = new Set(['READY_FOR_APPROVAL', 'APPROVED']);
  const isActionable = (i) => ACTIONABLE.has(i.status) || Boolean(i.sequenceInFlight);
  const ready = visible.filter(isActionable);
  const needsCall = visible.filter((i) => !isActionable(i));

  // The late-follow-up pilot set, reviewable as a set.
  //
  // Every draft in it is the same short close in the same approved shape, so
  // reading the shape once and the list of who receives it is the real
  // decision, and fifteen identical open-read-approve loops are friction, not
  // review. Counted from the whole payload rather than the visible slice: a
  // button that says "all" and means "the first few" would be a lie.
  //
  // The batch act is nothing but the existing approve action, run once per
  // package. Every server-side re-check still happens for every prospect: a
  // reply that arrived five minutes ago blocks that one row and the rest proceed.
  // Approving never sends. Each row keeps its own Send button afterwards, and
  // the send guard runs again in the last instant before Gmail.
  // One batch, two provenances: the late-follow-up closes and the sequences
  // Ary's skills staged. Both are whole approved-shapes; both arm the same way.
  const lateSet = (data.items || []).filter((i) => (i.lateFollowup || i.stagedSequence) && i.status === 'READY_FOR_APPROVAL');
  // What "Read draft" shows: the one new email. For a late close that is
  // Email 3 (1 and 2 already went); for a staged sequence it is Email 1.
  const lateDraftOf = (i) => (i.lateFollowup
    ? i.authorises?.steps?.find((st) => Number(st.step) === LATE_FOLLOWUP_STEP)?.body || ''
    : i.email?.body || '');

  const autoSendOn = Boolean(data.automation?.followups);

  const approveAllLate = async () => {
    setBatchBusy(true);
    let approved = 0;
    let armed = 0;
    const failures = [];
    const armFailures = [];
    for (const item of lateSet) {
      try {
        const r = await (await fetch('/api/outreach', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: item.id, action: 'approve', approveSequence: true }),
        })).json();
        if (r.ok) {
          approved += 1;
          setData((d) => ({ ...d, items: d.items.map((x) => (x.id === item.id ? { ...x, status: 'APPROVED', sequenceApproved: true } : x)) }));
        } else {
          failures.push({ name: item.name, reason: r.reason || r.error || 'refused' });
          continue;
        }
      } catch {
        failures.push({ name: item.name, reason: 'did not go through' });
        continue;
      }
      // The fourth consent, granted by the same tap the button describes:
      // this package may be sent by the engine while nobody is watching. Never
      // implied by approval — a separate action with its own server-side shape
      // check, and a package it refuses stays approved for hand-sending.
      try {
        const a = await (await fetch('/api/outreach', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: item.id, action: 'auto-followup', allow: true }),
        })).json();
        if (a.ok) armed += 1;
        else armFailures.push({ name: item.name, reason: a.error || 'not armed' });
      } catch {
        armFailures.push({ name: item.name, reason: 'not armed' });
      }
    }
    if (failures.length) {
      // The commonest refusal is the one worth naming: somebody replied since
      // the draft was written, and their follow-up is off for good.
      toast(`Approved ${approved} of ${lateSet.length}. Held back: ${failures.map((f) => `${f.name} (${f.reason})`).join('; ')}`, { tone: 'error' });
      load();
    } else if (armFailures.length) {
      toast(`Approved all ${approved}. ${armed} will send automatically; waiting for your Send now: ${armFailures.map((f) => f.name).join(', ')}.`, { tone: 'error' });
    } else if (autoSendOn) {
      toast(`Approved all ${approved}. The engine sends each inside your send window; a reply cancels that person's email.`, { tone: 'success' });
    } else {
      toast(`Approved all ${approved}. Auto-send is off in Settings, so each row waits for your Send now.`, { tone: 'success' });
    }
    setBatchBusy(false);
  };

  const Row = ({ item }) => {
    const isOpen = open === item.id;
    const edit = edits[item.id] || {};
    const changed = edit.subject !== undefined || edit.body !== undefined;
    const blocked = item.status === 'BLOCKED';
    const rating = ratings[item.id] ?? item.rating ?? '';

    // The same function the server uses. The previous version reimplemented
    // the rule here, and the two copies disagreed: the server would have
    // accepted an approval whose button this had already disabled.
    const card = approvalCard(
      {
        email_subject: item.email?.subject,
        email_body: item.email?.body,
        why_contact: item.whyContact,
        contact_email: item.contact?.email,
        followups: item.authorises?.steps?.filter((st) => st.step > 1) || [],
        prepared_by: item.preparedBy,
        cta_class: item.ctaClass,
        promise_made: item.promiseMade,
        evidence_level: item.evidenceLevel,
        credits_spent: item.creditsSpent,
        playbook: item.playbook,
        // Both were missing, so the card could never tell that a package was
        // already approved for its first email only. `sequence.upgrade` asks
        // for exactly that state and was therefore always null on screen.
        status: item.status,
        sequence_approved: item.sequenceApproved ? 1 : 0,
        // The automation block reads all four. The sequence control once
        // shipped into a branch that could never render because two fields
        // were missing here; these are the same class of field.
        priority_band: item.priorityBand,
        sequence_max_step: item.sequenceMaxStep,
        auto_followup_approved: item.autoFollowup?.approved ? 1 : 0,
        auto_followup_max_step: item.autoFollowup?.maxStep ?? null,
      },
      { id: item.prospectId, rating, emails_sent: item.emailsSent },
      // Read from the workspace rather than assumed. These were hardcoded to
      // false on the grounds that both switches were off, which was true when
      // it was written and is exactly the kind of comment that outlives its
      // fact. The approve button's label and the automation notice both depend
      // on it being right.
      { rating, autoSendFirst: Boolean(data.automation?.firstEmails), autoSendFollowups: Boolean(data.automation?.followups) }
    );

    return (
      <div className="border-b border-line last:border-b-0">
        <div className="px-5 py-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <p className="ui-heading font-semibold text-ink leading-snug">{item.name}</p>
              {item.business && (
                <p className="ui-body text-ink-2 mt-0.5">{item.business}</p>
              )}
              {item.country && <p className="ui-small text-ink-3 mt-1">{item.country}</p>}
            </div>
            {blocked && (
              <span className="shrink-0 ui-small font-semibold text-poppy-text max-w-[16rem]">{item.blockedReason}</span>
            )}
          </div>

          {!blocked && (
            <>
              <p className="mt-4 ui-body font-semibold text-ink leading-relaxed">{card.recommendation}</p>
              {card.finding && !isOpen && (
                <div className="mt-3">
                  <p className="ui-small font-semibold uppercase tracking-wider text-ink-3">What we found</p>
                  <p className="ui-body text-ink mt-1 leading-[1.7]">{card.finding}</p>
                </div>
              )}

              {card.email && !isOpen && (
                <div className="mt-4">
                  <p className="ui-small font-semibold uppercase tracking-wider text-ink-3">Email ready</p>
                  <p className="ui-body text-ink mt-1 font-medium">{card.email.subject}</p>
                  <p className="ui-body text-ink-2 mt-1 leading-[1.7] line-clamp-2">{card.email.preview}</p>
                </div>
              )}

              {card.coverage && !isOpen && (
                <p className="mt-4 ui-small text-ink-2">{card.coverage.text}</p>
              )}

              {/* Approved and waiting to go. Nothing sends on its own, so this
                  is the button that actually sends it, and it names the
                  recipient before it is pressed. */}
              {item.status === 'APPROVED' || item.sequenceInFlight ? (
                <div className="mt-4">
                  <p className="ui-body text-ink">
                    {item.sequenceInFlight
                      // The first email has gone and an approved follow-up is
                      // still owed. Saying "nothing has been sent yet" here
                      // would be false, and the difference matters: one is a
                      // first contact, the other continues a conversation.
                      ? 'The first email has gone. The next approved one in this sequence has not.'
                      : 'Approved. Nothing has been sent yet.'}
                  </p>

                  {/* The consent that is still outstanding, on the card that is
                      actually drawn for an approved package.

                      The first version of this put the sequence controls inside
                      the review panel, which is only reachable while a package
                      is NOT approved. So for the one state that needed it — an
                      approved first email with a written follow-up waiting — it
                      rendered nothing at all. */}
                  {card.sequence && !card.sequence.approved && (
                    <div className="mt-3 r-md border border-line-strong p-3">
                      <div className="ui-small font-semibold text-ink">
                        Email 1 is approved. Email {card.sequence.steps.map((s) => s.step).join(' and ')} is
                        {' '}written and <span className="underline">not approved</span>, so nothing can send it.
                      </div>
                      {card.sequence.steps.map((s) => (
                        <div key={s.step} className="mt-2 pt-2 border-t border-line-strong">
                          <div className="ui-small text-ink-2">Email {s.step}</div>
                          <div className="ui-body font-medium text-ink">{s.subject}</div>
                          <div className="mt-1 ui-body text-ink-2 whitespace-pre-wrap">{s.body}</div>
                        </div>
                      ))}
                      {card.sequence.canApprove && (
                        <div className="mt-3 flex items-center gap-3 flex-wrap">
                          <button
                            onClick={() => act(item, 'approve', { approveSequence: true })}
                            disabled={busy === item.id}
                            className="ui-body font-semibold px-4 py-2 r-md btn-approve-2nd transition"
                          >
                            {(card.sequence.upgrade || card.sequence.full).label}
                          </button>
                          <span className="ui-small text-ink-2">
                            {(card.sequence.upgrade || card.sequence.full).note}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {card.sequence && card.sequence.approved && (
                    <p className="mt-2 ui-small text-ink-2">
                      All {card.sequence.touches} emails in this sequence are approved.
                    </p>
                  )}

                  {/* The fourth consent. Separate control, separate press.
                      Approving words is not authorising a timer, so this is
                      never folded into the sequence button above. */}
                  {card.automation && (
                    <div className="mt-3 r-md border border-line-strong p-3">
                      <div className="ui-small font-semibold text-ink">
                        {card.automation.approved
                          ? `Automatic follow-up is on for this package, up to email ${card.automation.maxStep}.`
                          : card.automation.label}
                      </div>
                      <p className="mt-1 ui-small text-ink-2">{card.automation.note}</p>
                      {card.automation.globallyOff && (
                        <p className="mt-2 ui-small text-ink">{card.automation.globallyOff}</p>
                      )}
                      {/* A permission is state, not a command, so it is drawn
                          as a switch: visibly on or visibly off, flipped with
                          the exact same backend action as the buttons it
                          replaces. Turning it on never sends anything. */}
                      <div className="mt-3 flex items-center gap-3 flex-wrap">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={card.automation.approved ? 'true' : 'false'}
                          aria-label="Auto-followup for this package"
                          onClick={() => act(item, 'auto-followup', { allow: !card.automation.approved })}
                          disabled={busy === item.id}
                          className="switch-pill"
                        >
                          <span className="switch-knob" aria-hidden="true" />
                        </button>
                        <span className="ui-body font-semibold text-ink">
                          Auto-followup {card.automation.approved ? 'on' : 'off'}
                        </span>
                        <span className="ui-small text-ink-2">
                          {card.automation.approved ? card.automation.revoke.note : 'Nothing is sent by turning this on.'}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="mt-2 flex items-center gap-3 flex-wrap">
                    <button
                      onClick={() => send(item)}
                      disabled={busy === item.id}
                      aria-busy={busy === item.id || undefined}
                      className="ui-body font-semibold px-5 py-2.5 r-md btn-send transition inline-flex items-center gap-2"
                    >
                      {busy === item.id && <BloomSpinner size={16} />}
                      {busy === item.id ? 'Sending…' : 'Send now'}
                    </button>
                    <span className="ui-small text-ink-2">
                      Sends this email to {item.contact?.email} from hello@bloomwired.io.
                    </span>
                  </div>
                </div>
              ) : null}

              {/* Not rendered once approved, rather than hidden with a class.
                  A control that is present but display:none is still a control
                  somebody can trip over, and there is nothing left to review or
                  approve on a card whose only remaining act is the send. */}
              {item.status !== 'APPROVED' && !item.sequenceInFlight && (
              <div className="mt-4 flex items-center gap-2 flex-wrap">
                {card.canApprove && (
                  <button
                    onClick={() => setOpen(isOpen ? null : item.id)}
                    aria-expanded={isOpen}
                    className="ui-body font-semibold px-4 py-2 r-md btn-bloom transition"
                  >
                    {isOpen ? 'Close' : 'Review email'}
                  </button>
                )}
                <button
                  onClick={() => setDetails(details === item.id ? null : item.id)}
                  aria-expanded={details === item.id}
                  className="ml-auto ui-small text-ink-3 underline decoration-dotted hover:text-ink-2 transition"
                >
                  Details
                </button>
                <button
                  onClick={() => act(item, 'skip')}
                  disabled={busy === item.id}
                  className="ui-body font-medium px-3 py-2 r-md btn-danger-quiet transition"
                >
                  Skip
                </button>
              </div>
              )}

              {/* Everything internal, collapsed. Priority codes, credits,
                  evidence age and who wrote it are debugging data, and a card
                  that leads with them is an engineering dashboard. */}
              {details === item.id && (
                <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 ui-small text-ink-2 border-t border-line pt-3">
                  <div><dt className="inline text-ink-3">Priority </dt><dd className="inline">{card.details.band}</dd></div>
                  <div><dt className="inline text-ink-3">Emails allowed </dt><dd className="inline">{card.details.allowedLength}</dd></div>
                  <div><dt className="inline text-ink-3">Evidence </dt><dd className="inline">{card.details.evidenceLevel || 'unknown'}</dd></div>
                  <div><dt className="inline text-ink-3">Credits so far </dt><dd className="inline">{card.details.creditsSpent ?? 0}</dd></div>
                  <div><dt className="inline text-ink-3">Angle </dt><dd className="inline">{PLAYBOOK_LABEL[card.details.playbook] || card.details.playbook || 'none'}</dd></div>
                  <div><dt className="inline text-ink-3">Written by </dt><dd className="inline">{card.details.preparedBy === 'skill' ? 'Cowork' : 'the app'}</dd></div>
                </dl>
              )}
            </>
          )}
        </div>

        {isOpen && card.email && (
          <div className="px-5 pb-5 pt-1 border-t border-line">
            {/* One screen, one decision. Who it goes to, what it says, why
                this angle, and one button whose label is the truth. */}
            <p className="ui-small text-ink-3">To</p>
            <p className="ui-body text-ink">{item.contact?.email}</p>

            <label className="block mt-3">
              <span className="ui-small text-ink-3">Subject</span>
              <input
                type="text"
                value={edit.subject ?? card.email.subject}
                onChange={(e) => setEdits((m) => ({ ...m, [item.id]: { ...edit, subject: e.target.value } }))}
                className="mt-1 w-full bg-transparent border-0 border-b border-line focus:border-rose focus:outline-none ui-body text-ink py-1"
              />
            </label>

            <label className="block mt-3">
              <span className="ui-small text-ink-3">Message</span>
              <textarea
                rows={10}
                value={edit.body ?? card.email.body}
                onChange={(e) => setEdits((m) => ({ ...m, [item.id]: { ...edit, body: e.target.value } }))}
                className="mt-1 w-full bg-transparent border border-line r-md focus:border-rose focus:outline-none ui-body text-ink leading-relaxed p-3 resize-y"
              />
            </label>

            {card.finding && (
              <div className="mt-3">
                <p className="ui-meta font-semibold uppercase tracking-[0.07em] text-ink-3">Why we chose this</p>
                <p className="ui-body text-ink-2 mt-0.5 leading-relaxed">
                  {card.finding}
                  {card.details.promiseMade ? ` You are offering: ${card.details.promiseMade}.` : ''}
                </p>
              </div>
            )}

            {/* Her call, right next to the button it changes. */}
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <span className="ui-small text-ink-3">Your call:</span>
              {RATING_CHOICES.map((r) => (
                <button
                  key={r.value || 'none'}
                  onClick={() => setRatings((m) => ({ ...m, [item.id]: r.value }))}
                  aria-pressed={rating === r.value}
                  className={`ui-small px-2.5 py-1 r-md border transition ${
                    rating === r.value
                      ? 'border-line-strong bg-hover-wash font-semibold text-ink'
                      : 'border-line text-ink-2 hover:bg-hover-wash-soft'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {/* Every stored touch, shown before anything is agreed to.
                Approving a sequence means agreeing to words, so the words have
                to be on the screen. */}
            {card.sequence && (
              <div className="mt-4 r-md border border-line-strong p-3">
                <div className="ui-small font-semibold text-ink">
                  {card.sequence.approved
                    ? `All ${card.sequence.touches} emails are approved.`
                    : `${card.sequence.touches} emails are written. Approving the draft below approves the first one only.`}
                </div>
                {card.sequence.steps.map((s) => (
                  <div key={s.step} className="mt-2 pt-2 border-t border-line-strong">
                    <div className="ui-small text-ink-2">Email {s.step}</div>
                    <div className="ui-body font-medium text-ink">{s.subject}</div>
                    <div className="mt-1 ui-body text-ink-2 whitespace-pre-wrap">{s.body}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 flex items-center gap-3 flex-wrap">
              <button
                onClick={() => act(item, 'approve', {
                  ...(changed ? { subject: edit.subject ?? card.email.subject, bodyText: edit.body ?? card.email.body } : {}),
                  ...(rating !== item.rating ? { rating } : {}),
                })}
                disabled={busy === item.id || !card.canApprove}
                className="ui-body font-semibold px-4 py-2 r-md btn-approve transition"
              >
                {card.sequence && !card.sequence.approved ? card.sequence.firstOnly.label : card.approve.label}
              </button>
              {/* Said out loud, next to the button, every time. */}
              <span className="ui-small text-ink-2">
                {card.sequence && !card.sequence.approved ? card.sequence.firstOnly.note : card.approve.note}
              </span>

              {/* The wider consent, as its own act. Never inferred from the
                  button beside it. */}
              {card.sequence && !card.sequence.approved && card.sequence.canApprove && (
                <>
                  <button
                    onClick={() => act(item, 'approve', {
                      approveSequence: true,
                      ...(changed ? { subject: edit.subject ?? card.email.subject, bodyText: edit.body ?? card.email.body } : {}),
                      ...(rating !== item.rating ? { rating } : {}),
                    })}
                    disabled={busy === item.id || !card.canApprove}
                    className="ui-body font-semibold px-4 py-2 r-md btn-approve-2nd transition"
                  >
                    {(card.sequence.upgrade || card.sequence.full).label}
                  </button>
                  <span className="ui-small text-ink-2">
                    {(card.sequence.upgrade || card.sequence.full).note}
                  </span>
                </>
              )}
              {card.coverage && (
                <span className="w-full ui-small text-ink-2">{card.coverage.text}</span>
              )}
              <button
                onClick={() => setOpen(null)}
                className="ml-auto ui-body font-medium px-3 py-2 r-md border border-line-strong text-ink hover:bg-hover-wash-soft transition"
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="mt-6" aria-label="Ready for approval">
      {/* The one heading, above both piles.
          
          It used to live only in the zero-state branch, so on a day with real
          packages the cards rendered under no heading at all and the words
          "Ready for approval" appeared nowhere on Today. Searching the page for
          it found only the Old drafts blurb. One heading, rendered once,
          whatever the count. */}
      <Header />

      {/* The set review. Shown only while two or more pilot drafts are
          waiting, because a batch of one is just a row. Individual rows below
          keep working exactly as before for anything pulled out first. */}
      {lateSet.length >= 2 && (
        <div className="border border-line-strong r-lg bg-panel shadow-card overflow-hidden mb-4">
          <div className="px-5 py-5">
            <p className="ui-heading font-semibold text-ink leading-snug">
              {lateSet.every((i) => i.lateFollowup) ? 'Final follow-ups' : 'Ready to approve'}
              <span className="ml-2 text-ink-3 font-normal tabular-nums">{lateSet.length}</span>
            </p>
            <p className="ui-body text-ink-2 mt-2 leading-[1.7]">
              {lateSet.every((i) => i.lateFollowup)
                ? 'Two emails went, nobody replied, P1 allows one last touch. Every draft follows the same shape, grounded in their own thread.'
                : 'Follow-up closes and skill-staged sequences. Every safety check runs per person, at approval and again before send.'}
              {' '}Approving sends nothing by itself.
            </p>
            {lateSet.some((i) => i.lateFollowup) && (
              <div className="mt-4 r-md border border-line-strong bg-control-bg p-3.5">
                <p className="ui-small font-semibold uppercase tracking-wider text-ink-3">Follow-up shape</p>
                <p className="ui-body text-ink mt-1.5 leading-[1.7]">{LATE_FOLLOWUP_SHAPE}</p>
              </div>
            )}

            <div className="mt-3 border-t border-line">
              {lateSet.map((i) => (
                <div key={i.id} className="py-2.5 border-b border-line last:border-b-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <span className="ui-body font-medium text-ink">{i.name}</span>
                      {i.business && <span className="text-ink-2"> · {i.business}</span>}
                      <span className="text-ink-3"> · {i.email?.subject}</span>
                    </div>
                    <button
                      onClick={() => setBatchRead(batchRead === i.id ? null : i.id)}
                      aria-expanded={batchRead === i.id}
                      className="shrink-0 ui-small font-medium px-2.5 py-1 r-md border border-line-strong text-ink hover:bg-hover-wash-soft transition"
                    >
                      {batchRead === i.id ? 'Close' : 'Read draft'}
                    </button>
                    <button
                      onClick={() => act(i, 'skip')}
                      disabled={batchBusy || busy === i.id}
                      className="shrink-0 ui-small font-medium px-2.5 py-1 r-md btn-danger-quiet transition"
                    >
                      Discard
                    </button>
                  </div>
                  {batchRead === i.id && (
                    <p className="mt-2 ui-body text-ink-2 whitespace-pre-wrap border-l-2 border-line-strong pl-3">
                      {lateDraftOf(i) || 'The draft could not be read from this row.'}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-3 flex-wrap">
              <button
                onClick={approveAllLate}
                disabled={batchBusy}
                aria-busy={batchBusy || undefined}
                className="ui-body font-semibold px-5 py-2.5 r-md btn-approve transition inline-flex items-center gap-2"
              >
                {batchBusy && <BloomSpinner size={16} />}
                {batchBusy
                  ? 'Approving…'
                  : autoSendOn
                    ? `Approve all ${lateSet.length} and let LTB send them`
                    : `Approve all ${lateSet.length} follow-ups`}
              </button>
              <span className="ui-small text-ink-2">
                {autoSendOn
                  ? "One tap approves every sequence and lets the engine send each inside your send window. A reply arriving first cancels that person's email."
                  : "One tap approves every sequence and marks it ready for auto-send. Auto-send is off in Settings → Sending, so nothing goes until you flip it or press a row's Send now."}
              </span>
            </div>
          </div>
        </div>
      )}

      {ready.length > 0 && (
        <>

          <div className="border border-line-strong r-lg bg-panel shadow-card overflow-hidden">
            {ready.map((i) => <Row key={i.id} item={i} />)}
          </div>
        </>
      )}

      {needsCall.length > 0 && (
        <>
          <div className="flex items-center gap-1.5 ui-body font-semibold mt-6 mb-2 text-rose-text">
            <Icon name="alert-triangle" className="w-3.5 h-3.5" />
            Nothing verified yet ({needsCall.length})
          </div>
          <div className="border border-line-strong r-lg bg-panel shadow-card overflow-hidden">
            {needsCall.map((i) => (
              <div key={i.id} className="px-4 py-3 border-b border-line last:border-b-0">
                <span className="block font-medium text-ink truncate">{i.name}</span>
                <span className="block ui-body text-ink-2">{i.blockedReason || i.statusReason}</span>
                <button
                  onClick={() => onOpen && onOpen(i.prospectId)}
                  className="mt-1.5 ui-small font-medium px-2.5 py-1 r-md border border-line-strong text-ink hover:bg-hover-wash-soft transition"
                >
                  Open prospect
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function Label({ children }) {
  return <span className="ui-meta font-bold uppercase tracking-wider text-ink-3">{children}</span>;
}

function Pill({ tone, children }) {
  const c = tone === 'good' ? 'bg-leaf-wash text-leaf-text'
    : tone === 'warn' ? 'bg-poppy-wash text-poppy-text'
    : tone === 'accent' ? 'bg-rose-tint text-rose-text'
    : 'bg-control-bg text-ink-2';
  return <span className={`inline-block px-2 py-0.5 r-sm ui-meta font-semibold ${c}`}>{children}</span>;
}
