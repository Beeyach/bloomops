'use client';

// The email-sequence viewer/editor modal and its SeqCell-adjacent helpers
// (day labels + the sweep's fallback video wording). Extracted verbatim
// from ProspectsApp.jsx (split step 8).

import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icons';
import { toast } from '../../lib/toast.mjs';
import { stripProtocol } from './cells';
import { parseEmailSequence, parseVideoReasons, parseSentEmail } from '../../lib/prospect-parse.mjs';
import { EMAIL_SEND_DAYS, getLastSentNumber } from '../../lib/due.mjs';
import { fillSequenceTemplate, sanitizeSequenceTemplate } from '../../lib/sequence-template.mjs';
import { ensureThumb, richEmailFlavours } from '../../lib/thumb-client.mjs';

// Day the Nth email goes out in the sequence (1, 3, 7, 14, 21). Reads the
// EMAIL_SEND_DAYS schedule directly. 0 for anything off-schedule.
export function emailDayOffset(number) {
  return EMAIL_SEND_DAYS[number] ?? 0;
}

// "Email 2 — Day 3". Honors an explicit `day` on the stored email if present.
export function emailDayLabel(email) {
  const day = typeof email?.day === 'number' ? email.day : emailDayOffset(email?.number);
  return `Email ${email?.number ?? '?'}. Day ${day}`;
}






// What a finding is called out loud, for the one line of the fallback email
// that names what the video is about. Short and plain, because it lands mid
// sentence: "a short video going through the buttons all going to the same
// place on your site".
export const REASON_PHRASE = {
  cta: 'the top of your homepage',
  'ctas-collapse': 'the buttons all going to the same place',
  'contact-page-no-form': 'the contact page',
  'no-contact': 'how someone gets in touch',
  'no-booking': 'the booking side',
  'booking-is-a-form': 'the booking side',
  'calendar-not-loading': 'the booking calendar',
  'phone-mismatch': 'the phone number',
  'stale-copyright': 'the footer',
  'ancient-markup': 'how the site is built',
  'stale-stack': 'how the site is built',
  slow: 'how long the page takes to load',
  insecure: 'the not-secure warning',
  'mixed-content': 'the parts of the page being blocked',
  noindex: 'why the site is not showing in Google',
  'no-meta-description': 'how the site shows in search results',
  'no-title': 'how the site shows in search results',
  viewport: 'how the site sits on a phone',
  'mobile-overflow': 'how the site sits on a phone',
  'broken-images': 'the images that are not loading',
  'dead-image-host': 'the images that are not loading',
  'dead-links': 'the links that go nowhere',
  'dead-link-one': 'the link that goes nowhere',
  'no-reply-promise': 'what happens after someone reaches out',
  'quote-form-thin': 'the quote form',
};

// The email the sweep sends when a video exists but this email has no video
// wording written for it. Reproduced here so the sequence can show what will
// actually go out rather than a note saying wording exists somewhere.
//
// Kept word for word in step with the sweep skill's own fallback. If that text
// is ever edited, this has to move with it, or the screen quietly starts
// describing an email nobody sends.
export function fallbackVideoBody(reasons) {
  const first = (reasons || []).find((r) => REASON_PHRASE[r]);
  const thing = first ? REASON_PHRASE[first] : 'what I noticed on your site';
  return [
    'Hi [Name],',
    '',
    `I recorded a short video going through ${thing} on your site, the part I mentioned before. It's about 90 seconds.`,
    '',
    "If that's already fixed on your end, even better. The link is right below.",
    '',
    '🌸 Ary',
  ].join('\n');
}

// Read-only viewer for the stored cold-outreach sequence. Bodies render in a
// pre-wrap block so line breaks and spacing survive exactly as stored.
export default function EmailSequenceModal({ prospect, onClose, onSaveSequence, onOpened }) {
  // Workspace template, loaded only when the prospect has no emails yet.
  const [tpl, setTpl] = useState(null);
  const hasEmails = Array.isArray(parseEmailSequence(prospect?.email_sequence))
    && parseEmailSequence(prospect?.email_sequence).length > 0;
  useEffect(() => {
    if (hasEmails || tpl !== null) return;
    let alive = true;
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => { if (alive) setTpl(sanitizeSequenceTemplate(d?.settings?.sequenceTemplate)); })
      .catch(() => { if (alive) setTpl([]); });
    return () => { alive = false; };
  }, [hasEmails, tpl]);
  // Once, on open. What is on screen here is a claim about what happens next,
  // and it is worth a round trip to be sure the stage behind it is current.
  useEffect(() => {
    onOpened?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [showAll, setShowAll] = useState(false);
  // Only one email may be in edit mode at a time.
  const [editingNumber, setEditingNumber] = useState(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(null);
  const seq = parseEmailSequence(prospect.email_sequence) || [];
  const sorted = [...seq].sort((a, b) => (a.number || 0) - (b.number || 0));

  // Rebuild the whole array with one entry replaced, then persist it. Extra
  // fields on the email (e.g. `day`) are preserved.
  async function saveEmail(number, { subject, body }) {
    if (saving) return;
    setSaving(true);
    try {
      const next = sorted.map((e) =>
        e.number === number ? { ...e, subject, body } : e
      );
      await onSaveSequence(next);
      setEditingNumber(null);
      setJustSaved(number);
      setTimeout(() => setJustSaved((n) => (n === number ? null : n)), 1600);
    } catch {
      // updateProspect already alerted and rolled the store back.
    } finally {
      setSaving(false);
    }
  }

  const lastSent = getLastSentNumber(prospect);
  const unsent = sorted.filter((e) => (e.number || 0) > lastSent);
  const sentCount = sorted.length - unsent.length;
  const allSent = sorted.length > 0 && unsent.length === 0;
  const nextUp = unsent[0] || null;
  // Only worth a toggle when there's actually something hidden either way.
  const canToggle = sentCount > 0 && unsent.length > 0;
  // When everything's sent there's nothing to hide, so always show the lot.
  const visible = showAll || allSent ? sorted : unsent;
  // Email 4 means Email 5 (the one carrying the PDF) is up next.
  const pdfIsNext = prospect.stage === 'Email 4';
  // Which wording actually goes out. The sweep sends the video variant only
  // while a link exists and it has not already been sent once.
  const hasVideoUrl = !!prospect.video_url;
  // Either mark counts as sent, not just the date.
  //
  // The sweep stamps two things after a confirmed send: video_sent_at, and
  // video_sent_email holding the words that went out. They are separate writes,
  // so a tab closed or a connection dropped between them leaves one landed and
  // the other missing. Reading only the date would then show a video as still
  // to send when a copy of it is sitting on the record, and the next email in
  // the sequence would send it a second time.
  //
  // Neither field is written before the send is confirmed, so treating either
  // as proof cannot mark something sent that never went.
  const videoAlreadySent = !!prospect.video_sent_at || !!prospect.video_sent_email;
  const videoEligible = hasVideoUrl && !videoAlreadySent;
  // A video goes out once, so at most one email's video wording is ever live:
  // the earliest unsent one that can carry it. Later ones would only send after
  // the video had already gone, by which point video_sent_at rules them out.
  //
  // An email with no video wording of its own still counts, as long as it is one
  // of the two the sweep is willing to swap: it falls back to a standard body
  // and sends the link anyway. Looking only for body_video meant a sequence
  // written before the video existed had nothing to mark, so every block read
  // "Not sending" while the sweep was going to send one. melissaoatman.com had
  // a rendered video, nothing sent yet, and both blocks claiming neither would
  // go.
  const videoSendNumber = videoEligible
    ? unsent.find((e) => !!e.body_video || VIDEO_VARIANT_EMAILS.has(e.number))?.number ?? null
    : null;
  // The one-off sends, if either has happened. Parsed here because the modal
  // gets the raw row, where these are still JSON text.
  const videoSentMail = parseSentEmail(prospect.video_sent_email);
  const playbookSentMail = parseSentEmail(prospect.playbook_sent_email);

  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return;
      // Escape backs out of an edit first, so a stray keypress can't discard
      // the whole modal (and the edit) in one go.
      if (editingNumber != null) setEditingNumber(null);
      else onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, editingNumber]);

  const title = prospect.business_name || prospect.name || prospect.email || 'Prospect';

  return (
    <div
      className="fixed inset-0 bg-charcoal/40 backdrop-blur-sm flex items-center justify-center z-50 px-4 py-10"
      // Don't let a stray backdrop click throw away an in-progress edit.
      onClick={() => { if (editingNumber == null) onClose(); }}
    >
      <div
        className="bg-panel border border-line-strong shadow-card rounded-2xl shadow-card w-full max-w-2xl max-h-full overflow-y-auto bw-scroll"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-surface border-b border-line px-7 pt-6 pb-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-[12px] font-semibold text-charcoal mb-1">
              Email sequence
            </div>
            <h3 className="font-serif text-2xl text-charcoal leading-tight">{title}</h3>
            {prospect.email && (
              <div className="mt-1 text-xs text-muted">{prospect.email}</div>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-muted hover:text-charcoal px-2 py-1.5 rounded hover:bg-blush-soft transition inline-flex items-center"
            title="Close (Esc)"
          >
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>

        <div className="px-7 py-6 space-y-6">
          {(prospect.pdf_filename || prospect.review_url) && (
            <section>
              <div className="text-[12px] font-semibold text-charcoal mb-2">
                Email 5 PDF
              </div>

              {prospect.pdf_filename && (
                <div
                  className={`inline-flex flex-col gap-1 rounded-lg px-3 py-2 border transition ${
                    pdfIsNext ? 'border-mauve bg-blush-soft' : 'border-line bg-paper'
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    <span className="text-mauve-deep">
                      <Icon name="file-text" className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-xs text-charcoal-2">
                      {prospect.pdf_filename}
                    </span>
                  </span>
                  <span className="text-[10px] text-muted">
                    Stored in prospect-pdfs/
                  </span>
                </div>
              )}

              {prospect.review_url && (
                <div className={prospect.pdf_filename ? 'mt-2' : ''}>
                  <a
                    href={prospect.review_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-xs text-mauve-deep hover:underline"
                  >
                    <Icon name="file-text" className="w-3.5 h-3.5" />
                    View review PDF
                    <Icon name="external-link" className="w-3 h-3 opacity-70" />
                  </a>
                  <div className="mt-0.5 text-[10px] text-muted break-all">
                    {stripProtocol(prospect.review_url)}
                  </div>
                </div>
              )}

              {pdfIsNext && (
                <p className="mt-1.5 text-[10px] text-mauve-deep">
                  Email 5 is next. Attach this.
                </p>
              )}
            </section>
          )}

          <section>
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <div className="text-[12px] font-semibold text-charcoal">
                Emails ({sorted.length})
              </div>
              {canToggle && (
                <button
                  onClick={() => setShowAll((v) => !v)}
                  className="text-[12px] font-medium text-mauve-deep hover:underline"
                >
                  {showAll ? 'Show unsent only' : `Show all emails (${sentCount} sent)`}
                </button>
              )}
            </div>

            {sorted.length === 0 ? (
              <div>
                <p className="text-sm text-muted italic mb-3">
                  No emails stored for this prospect yet.
                </p>
                {/* The workspace template (Settings → Email template),
                    fetched on demand only when there's nothing stored.
                    Applying COPIES with placeholders filled — later template
                    edits never rewrite this prospect's emails. */}
                {tpl && tpl.length > 0 && (
                  <button
                    onClick={() => onSaveSequence(fillSequenceTemplate(tpl, prospect))}
                    className="text-[13px] font-semibold px-3.5 py-2 rounded-[8px] btn-bloom transition"
                  >
                    Use the template ({tpl.length} email{tpl.length === 1 ? '' : 's'})
                  </button>
                )}
                {tpl && tpl.length === 0 && (
                  <p className="text-[12px] text-ink-3">
                    Tip: write a reusable 5-email template once in Settings → Email template,
                    and this button fills it in with their name and business.
                  </p>
                )}
              </div>
            ) : (
              <>
                {allSent && (
                  <p className="mb-3 text-[11px] text-muted">Sequence complete.</p>
                )}
                <div className="space-y-4">
                  {visible.map((e, i) => (
                    <EmailCard
                      key={e.number ?? i}
                      email={e}
                      sent={(e.number || 0) <= lastSent}
                      isNext={!!nextUp && e.number === nextUp.number}
                      stageBasis={prospect.stage || null}
                      // Email 5 is the one that carries the review PDF.
                      recipient={prospect.email || ''}
                      reviewUrl={e.number === 5 ? prospect.review_url : null}
                      videoUrl={prospect.video_url || null}
                      videoReasons={parseVideoReasons(prospect.video_reasons)}
                      videoSends={videoSendNumber != null && e.number === videoSendNumber}
                      isEditing={editingNumber === e.number}
                      // Starting an edit closes any other open one.
                      onEdit={() => setEditingNumber(e.number)}
                      onCancel={() => setEditingNumber(null)}
                      onSave={(draft) => saveEmail(e.number, draft)}
                      saving={saving}
                      justSaved={justSaved === e.number}
                    />
                  ))}
                </div>
              </>
            )}
          </section>

          {/* Outside the numbered five, so it sits after them behind its own
              heading rather than pretending to be Email 6. */}
          {(videoSentMail || playbookSentMail) && (
            <section className="border-t border-line pt-6">
              <div className="text-[12px] font-semibold text-charcoal mb-1">
                Sent outside the sequence
              </div>
              <p className="mb-3 text-[11px] text-muted">
                Written at send time, so these were never part of the five.
              </p>
              <div className="space-y-4">
                {videoSentMail && (
                  <SentOneOffCard label="Video email (sent)" mail={videoSentMail} />
                )}
                {playbookSentMail && (
                  <SentOneOffCard label="Playbook email (sent)" mail={playbookSentMail} />
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

// Textarea that grows to fit its content so a long email body doesn't sit in
// a tiny scrolling box. Floors at 200px.
function autoGrow(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.max(200, el.scrollHeight)}px`;
}

// The emails the sweep can swap for a video variant. Only these get the
// "no video version written" note, so the other three stay uncluttered.
const VIDEO_VARIANT_EMAILS = new Set([3, 4]);

// Which of the two wordings is going out. Mirrors the pills in the card
// header so the whole card reads in one visual language.
function SendBadge({ live }) {
  return (
    <span
      className={`text-[9px] tracking-wide px-1.5 py-0.5 rounded-full ${
        live ? 'bg-mauve-deep text-white' : 'bg-charcoal/10 text-muted'
      }`}
    >
      {live ? 'Sends' : 'Not sending'}
    </span>
  );
}

// The link line the sweep adds after the sign-off. It is not part of the
// stored body, so it is shown dimmer and dashed, labelled as something that
// happens at send time rather than something Ary wrote.
function AppendedLink({ url }) {
  return (
    <div className="px-4 pb-3">
      <div className="rounded-lg border border-dashed border-line px-3 py-2">
        <div className="text-[10px] text-muted mb-1">added at send</div>
        <pre className="text-sm text-muted whitespace-pre-wrap font-sans leading-relaxed m-0">{`Here's the link to it:\n${url}`}</pre>
      </div>
    </div>
  );
}

// One of the two emails that never lived in the numbered sequence: the
// standalone video email, or the playbook reactivation. The sweep stores each
// one after a confirmed send, so this is a record of what went out rather than
// a draft of what will. Read only, and kept apart from the numbered five.
function SentOneOffCard({ label, mail }) {
  return (
    <article className="bg-paper border border-line rounded-xl overflow-hidden">
      <header className="px-4 py-3 border-b border-line/70 flex items-center gap-2.5 flex-wrap">
        <span className="text-[11px] font-semibold text-charcoal-2">{label}</span>
        {mail.sent_at && (
          <span className="bg-charcoal/10 text-muted text-[9px] tracking-wide px-1.5 py-0.5 rounded-full">
            Sent {mail.sent_at}
          </span>
        )}
      </header>
      <div className="px-4 pt-3">
        <div className="text-[12px] font-semibold text-charcoal mb-1">Subject</div>
        <div className="text-sm font-medium leading-snug text-charcoal">
          {mail.subject || <span className="text-muted italic">(no subject)</span>}
        </div>
      </div>
      <div className="px-4 pt-3">
        <div className="text-[12px] font-semibold text-charcoal mb-1">Body</div>
      </div>
      <pre className="px-4 pb-3 text-sm text-charcoal-2 whitespace-pre-wrap font-sans leading-relaxed m-0">{mail.body}</pre>
    </article>
  );
}

// One email in the sequence. `sent` dims it and swaps in a SENT pill;
// `isNext` gives it the mauve left-edge stripe as the one to send next.
// `isEditing` swaps the static subject/body for inputs.
//
// An email may also carry subject_video/body_video, the wording the sweep uses
// when a video link exists. Both versions are shown read-only, badged with
// which one actually sends, so what goes out is never a guess.
//
// `videoSends` is about THIS email, not the prospect: true only when this is
// the one email whose video wording is going out. Every other video block,
// and all of them once the video has been sent, reads "Not sending".
function EmailCard({
  email, sent, isNext, recipient, reviewUrl, videoUrl, videoSends, videoReasons, stageBasis,
  isEditing, onEdit, onCancel, onSave, saving, justSaved,
}) {
  const [subject, setSubject] = useState(email.subject || '');
  const [body, setBody] = useState(email.body || '');
  const bodyRef = useRef(null);

  // Re-seed the drafts whenever we (re)enter edit mode, or the stored email
  // changes underneath us.
  useEffect(() => {
    if (isEditing) {
      setSubject(email.subject || '');
      setBody(email.body || '');
    }
  }, [isEditing, email.subject, email.body]);

  useEffect(() => {
    if (isEditing) autoGrow(bodyRef.current);
  }, [isEditing]);

  // The video wording is shown whenever it was written, whatever the number.
  // The note about falling back is only for the two emails the sweep can swap,
  // and only once a link actually exists to swap for.
  const hasVideoVersion = !!email.body_video;
  // Only on the email that actually sends it.
  //
  // The sweep can swap either email 3 or 4, so this drew a fallback block under
  // both and the sequence read as two video emails when only one will ever go.
  // The video is sent once; showing it twice is showing an email that does not
  // exist.
  const showFallbackNote =
    !!videoUrl && !hasVideoVersion && VIDEO_VARIANT_EMAILS.has(email.number) && videoSends;
  // True when the video wording, written or fallback, is what this email sends.
  // The standard body is then not going out and is hidden, so the card shows the
  // one email the prospect actually receives.
  const standardIsReplaced = videoSends && (hasVideoVersion || showFallbackNote);

  // Both link lines mirror the sweep's own conditions, so the preview shows an
  // append only when one actually happens.
  //
  // Video: appended after the sign-off unless the stored wording already
  // carries a URL of its own, which the sweep treats as "already linked".
  const appendsVideoLink =
    hasVideoVersion && videoSends && !!videoUrl && !/https?:\/\//i.test(email.body_video || '');
  // Email 5: the review link is normally written into the body, and the sweep
  // only appends when it is missing from it.
  const appendsReviewLink =
    !!reviewUrl && !String(email.body || '').includes(reviewUrl);

  // Copy exactly what goes out: the sending version's wording, with the same
  // link the sweep would append. Kills the select-by-hand step when an email
  // is sent from Gmail directly.
  const [copied, setCopied] = useState(null);
  // The exact wording that goes out: sending version plus the link the
  // sweep would append. One source feeds Copy AND Compose, so what you
  // send by hand can never differ from what the buttons showed.
  function outgoingPart(which) {
    const usesVideo = hasVideoVersion && videoSends;
    if (which === 'subject') {
      return (usesVideo ? email.subject_video || email.subject : email.subject) || '';
    }
    let text = (usesVideo ? email.body_video || email.body : email.body) || '';
    if (appendsVideoLink) text += `\n\n${videoUrl}`;
    else if (appendsReviewLink && !usesVideo) text += `\n\n${reviewUrl}`;
    return text;
  }
  async function copyPart(which) {
    try {
      await navigator.clipboard.writeText(outgoingPart(which));
      setCopied(which);
      setTimeout(() => setCopied((cur) => (cur === which ? null : cur)), 1500);
    } catch {
      toast('Your browser blocked clipboard access, so nothing was copied.', { tone: 'error' });
    }
  }
  // The whole outgoing body with the video link swapped for a clickable
  // picture of their site. One paste into the Gmail body replaces the plain
  // draft with the rich one. Takes a couple of seconds: it reads a frame out
  // of the mp4 and hosts it before anything reaches the clipboard.
  async function copyRich() {
    try {
      setCopied('rich-working');
      const thumb = await ensureThumb(videoUrl);
      const { html, plain } = richEmailFlavours(outgoingPart('body'), videoUrl, thumb);
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        }),
      ]);
      setCopied('rich');
      toast('Copied with the picture. In the Gmail window: click the body, press Ctrl+A, then Ctrl+V.');
      setTimeout(() => setCopied((cur) => (cur === 'rich' ? null : cur)), 2500);
    } catch (e) {
      setCopied(null);
      toast(`Could not build the picture email. ${e.message}`, { tone: 'error' });
    }
  }
  // Gmail compose deep link: recipient, subject and body prefilled — one
  // click and she only presses Send. A plain link, no Gmail login or API.
  const composeUrl = recipient
    ? 'https://mail.google.com/mail/?view=cm&fs=1'
      + `&to=${encodeURIComponent(recipient)}`
      + `&su=${encodeURIComponent(outgoingPart('subject'))}`
      + `&body=${encodeURIComponent(outgoingPart('body'))}`
    : null;

  return (
    <article
      className={`bg-paper border rounded-xl overflow-hidden transition ${
        isNext ? 'border-l-4 border-l-mauve-deep' : ''
      } ${sent && !isEditing ? 'opacity-60' : ''} ${
        justSaved ? 'border-leaf-text ring-1 ring-leaf-text/30' : 'border-line'
      }`}
    >
      <header className="px-4 py-3 border-b border-line/70 flex items-center gap-2.5 flex-wrap">
        <span
          className={`shrink-0 w-6 h-6 rounded-full text-[11px] flex items-center justify-center ${
            sent ? 'bg-charcoal/10 text-muted' : 'bg-mauve text-white'
          }`}
        >
          {email.number}
        </span>
        <span className="text-[11px] font-medium text-muted shrink-0">
          {emailDayLabel(email)}
        </span>
        {sent && (
          <span className="bg-charcoal/10 text-muted text-[9px] tracking-wide px-1.5 py-0.5 rounded-full">
            Sent
          </span>
        )}
        {/* Says what it is reading from. The sweep works the same email out the
            same way, from the stage, so a badge that names the stage can be
            checked against the row rather than taken on trust. */}
        {isNext && (
          <span
            title={stageBasis ? `Because the stage is ${stageBasis}` : undefined}
            className="bg-mauve-deep text-white text-[9px] tracking-wide px-1.5 py-0.5 rounded-full"
          >
            Next to send{stageBasis ? ` · after ${stageBasis}` : ''}
          </span>
        )}
        {justSaved && (
          <span className="text-[10px] font-semibold" style={{ color: 'var(--positive-text)' }}>
            Saved
          </span>
        )}

        {!isEditing && (
          <span className="ml-auto shrink-0 inline-flex items-center gap-2">
            {composeUrl && !sent && (
              <button
                onClick={() => {
                  // A compose-sized popup, not a full tab: the tracker stays
                  // exactly where it is, and closing the popup puts her back.
                  // If the browser refuses popups it falls back to a tab.
                  const w = window.open(composeUrl, '_blank', 'popup=yes,width=700,height=640,noopener,noreferrer');
                  if (!w) window.open(composeUrl, '_blank', 'noopener,noreferrer');
                }}
                title={`Opens a small Gmail window with this email already written to ${recipient}. You just press Send.`}
                className={'inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1 rounded-[8px] transition ' + (
                  isNext ? 'btn-bloom' : 'border border-line-strong text-ink hover:bg-blush-soft'
                )}
              >
                <Icon name="send" className="w-3 h-3" />
                Compose in Gmail
              </button>
            )}
            <button
              onClick={() => copyPart('subject')}
              className="inline-flex items-center gap-1 text-[12px] font-medium px-2 py-0.5 rounded-[8px] border border-line-strong text-ink hover:bg-blush-soft transition"
              title="Copy the subject that goes out"
            >
              <Icon name="clipboard" className="w-3 h-3" />
              {copied === 'subject' ? 'Copied' : 'Copy subject'}
            </button>
            <button
              onClick={() => copyPart('body')}
              className="inline-flex items-center gap-1 text-[12px] font-medium px-2 py-0.5 rounded-[8px] border border-line-strong text-ink hover:bg-blush-soft transition"
              title="Copy the body that goes out, including any appended link"
            >
              <Icon name="clipboard" className="w-3 h-3" />
              {copied === 'body' ? 'Copied' : 'Copy body'}
            </button>
            {/* Only on the email that actually carries the video: the whole
                body with the link swapped for a clickable picture of their
                site. Paste over the Gmail draft and it is a Loom-style email. */}
            {videoSends && !!videoUrl && (
              <button
                onClick={copyRich}
                disabled={copied === 'rich-working'}
                className="inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-0.5 rounded-[8px] border border-rose text-rose-text hover:bg-blush-soft transition disabled:opacity-60"
                title="Copy the whole email with a clickable picture of their site instead of a bare link. In Gmail: click the body, Ctrl+A, Ctrl+V."
              >
                <Icon name="image" className="w-3 h-3" />
                {copied === 'rich-working' ? 'Making it…' : copied === 'rich' ? 'Copied, paste in Gmail' : 'Copy with picture'}
              </button>
            )}
            <button
              onClick={onEdit}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-muted hover:text-mauve-deep transition"
              title="Edit this email"
            >
              <Icon name="pencil" className="w-3 h-3" />
              Edit
            </button>
          </span>
        )}
      </header>

      {isEditing ? (
        <div className="px-4 py-3 space-y-3">
          <div>
            <label className="block text-[12px] font-semibold text-charcoal mb-1">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 text-sm text-charcoal bg-panel border border-line-strong shadow-card rounded-lg outline-none focus:border-mauve-deep focus:ring-1 focus:ring-mauve-deep/30 transition"
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-charcoal mb-1">
              Body
            </label>
            <textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                autoGrow(e.target);
              }}
              className="w-full min-h-[200px] px-3 py-2.5 text-sm text-charcoal bg-panel border border-line-strong shadow-card rounded-lg outline-none resize-y whitespace-pre-wrap leading-relaxed focus:border-mauve-deep focus:ring-1 focus:ring-mauve-deep/30 transition"
            />
          </div>
          <div className="flex items-center justify-end gap-4">
            <button
              onClick={onCancel}
              className="text-muted text-sm hover:text-charcoal transition"
            >
              Cancel
            </button>
            <button
              onClick={() => onSave({ subject, body })}
              disabled={saving}
              className="bg-mauve-deep text-white rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Only name the versions when there are two of them, so the ordinary
              email keeps the layout it has always had. */}
          {hasVideoVersion && !standardIsReplaced && (
            <div className="px-4 pt-3 flex items-center gap-2">
              <span className="text-[11px] font-semibold text-charcoal-2">
                Standard version
              </span>
              <SendBadge live={!videoSends} />
            </div>
          )}
          {/* Hidden when the video version is the one going out. The standard
              wording is still stored and still shown on every other email; it
              is just not what this prospect receives, and showing an email that
              will not be sent beside the one that will is the clutter that made
              the sequence read as two emails. */}
          {!standardIsReplaced && (
            <>
              {/* Label subject and body explicitly. Bold-vs-normal alone left the
                  subject ambiguous to skim (and to anything scraping the DOM). */}
              <div className="px-4 pt-3">
                <div className="text-[12px] font-semibold text-charcoal mb-1">
                  Subject
                </div>
                <div
                  data-email-subject
                  className="text-sm font-medium leading-snug text-charcoal"
                >
                  {email.subject || <span className="text-muted italic">(no subject)</span>}
                </div>
              </div>
              <div className="px-4 pt-3">
                <div className="text-[12px] font-semibold text-charcoal mb-1">
                  Body
                </div>
              </div>
              <pre
                data-email-body
                className="px-4 pb-3 text-sm text-charcoal-2 whitespace-pre-wrap font-sans leading-relaxed m-0"
              >{email.body}</pre>
            </>
          )}
          {/* Only when the standard wording is the one going out. */}
          {appendsReviewLink && !(hasVideoVersion && videoSends) && (
            <AppendedLink url={reviewUrl} />
          )}

          {hasVideoVersion && (
            <div className="border-t border-line/70">
              <div className="px-4 pt-3 flex items-center gap-2">
                <span className="text-[11px] font-semibold text-charcoal-2">
                  Video version
                </span>
                <SendBadge live={videoSends} />
              </div>
              <div className="px-4 pt-3">
                <div className="text-[12px] font-semibold text-charcoal mb-1">
                  Subject
                </div>
                <div
                  data-email-subject-video
                  className="text-sm font-medium leading-snug text-charcoal"
                >
                  {email.subject_video || (
                    <span className="text-muted italic">(same as standard)</span>
                  )}
                </div>
              </div>
              <div className="px-4 pt-3">
                <div className="text-[12px] font-semibold text-charcoal mb-1">
                  Body
                </div>
              </div>
              <pre
                data-email-body-video
                className="px-4 pb-3 text-sm text-charcoal-2 whitespace-pre-wrap font-sans leading-relaxed m-0"
              >{email.body_video}</pre>
              {appendsVideoLink && <AppendedLink url={videoUrl} />}
            </div>
          )}

          {/* A link exists but this email has no video wording of its own, so
              the sweep falls back to a standard body. Shown in full rather than
              described: a note saying wording exists somewhere is not something
              anybody can check, and the whole point of this screen is seeing
              what actually goes out. This is the same text the sweep builds,
              link included. */}
          {showFallbackNote && (
            <div className="border-t border-line/70">
              <div className="px-4 pt-3 flex items-center gap-2">
                <span className="text-[11px] font-semibold text-charcoal-2">
                  Video version (fallback)
                </span>
                <SendBadge live={videoSends} />
              </div>
              <div className="px-4 pt-3">
                <div className="text-[12px] font-semibold text-charcoal mb-1">Body</div>
              </div>
              <pre className="px-4 pb-3 text-sm text-charcoal-2 whitespace-pre-wrap font-sans leading-relaxed m-0">{fallbackVideoBody(videoReasons)}</pre>
              <AppendedLink url={videoUrl} />
            </div>
          )}
          {reviewUrl && (
            <div className="px-4 pb-3 -mt-1">
              <a
                href={reviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[11px] text-mauve-deep hover:underline break-all"
                title={reviewUrl}
              >
                <Icon name="file-text" className="w-3 h-3 shrink-0" />
                Review attached: {stripProtocol(reviewUrl)}
              </a>
            </div>
          )}
        </>
      )}
    </article>
  );
}


