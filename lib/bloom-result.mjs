// A stable envelope for every window.bloom setter's outcome, so automation
// can tell a real write from a silent no-op:
//   success → { ok: true, field, value, prospect }
//   failure → { ok: false, error }
// The updated row is kept on success as `prospect`, so callers that read the
// old return value (the row itself) still have it. A result that already
// carries `ok` is passed through unchanged, so a setter that delegates to
// another setter never double-wraps.

export function isEnvelope(v) {
  return !!v && typeof v === 'object' && 'ok' in v;
}

export function okResult(field, value, prospect) {
  if (isEnvelope(prospect)) return prospect;
  return { ok: true, field, value: value === undefined ? null : value, prospect: prospect ?? null };
}

export function errResult(error) {
  const message = error && error.message ? error.message : String(error);
  return { ok: false, error: message };
}

// Wraps one async setter: identical call signature, but it always resolves to
// an envelope and never throws — so even an un-awaited setter whose write
// fails leaves a console.warn behind instead of vanishing. `field` names the
// column it writes; `value` is taken from the first argument after the key
// (args[1]) by convention.
export function wrapSetter(fn, field, warn) {
  const log = warn || ((m) => { if (typeof console !== 'undefined') console.warn(m); });
  return async function wrapped(...args) {
    try {
      const prospect = await fn.apply(this, args);
      return okResult(field, args.length > 1 ? args[1] : null, prospect);
    } catch (e) {
      log(`[bloom] ${field} write failed: ${e && e.message ? e.message : e}`);
      return errResult(e);
    }
  };
}

// The column each setter writes, so its envelope can report a meaningful
// `field`. Reads and constants are absent on purpose — only these get wrapped.
// Signatures are NOT changed; only the resolved value gains the envelope.
export const SETTER_FIELDS = {
  addProspect: 'prospect',
  setFields: 'fields',
  setName: 'name',
  setBusiness: 'business_name',
  setStage: 'stage',
  markReplied: 'stage',
  setRating: 'rating',
  setCountry: 'country',
  setLastContact: 'last_contact_date',
  setChatLink: 'claude_chat_link',
  setEmailSequence: 'email_sequence',
  updateEmail: 'email_sequence',
  setAuditNotes: 'audit_notes',
  setPdfFilename: 'pdf_filename',
  setInfo: 'info',
  addLog: 'activity_log',
  setVideo: 'video_tier',
  setVideoUrl: 'video_url',
  markVideoSent: 'video_sent_at',
  setVideoSentEmail: 'video_sent_email',
  setPlaybookSentEmail: 'playbook_sent_email',
  setReviewUrl: 'review_url',
  setReplied: 'replied',
  setReplyType: 'reply_type',
  setReplyDate: 'reply_date',
  setNextActionDate: 'next_action_date',
  setSource: 'source',
};

// Replaces each named setter on `api` with its wrapped version, in place, and
// returns the same object. Non-setter members (reads, constants) are left
// exactly as they are. Binding to `api` keeps internal delegation
// (e.g. updateEmail → setEmailSequence) resolving to the wrapped methods,
// which the pass-through in okResult then leaves un-double-wrapped.
export function finalizeWriteApi(api, warn) {
  for (const [name, field] of Object.entries(SETTER_FIELDS)) {
    if (typeof api[name] === 'function') {
      api[name] = wrapSetter(api[name].bind(api), field, warn);
    }
  }
  return api;
}
