// The window.bloom automation surface, built against the component's
// in-memory canonical store. Extracted verbatim from ProspectsApp.jsx
// (split step 5) — ProspectsApp keeps only the bridge wiring (refs +
// install effect) and passes the live store accessors in here.

import {
  todayIso, isoShift, daysBetween,
  STAMP_ONLY_STAGES, DUE_DAYS_BY_STAGE, DEFAULT_DUE_STAGES,
  FINISHED_AFTER_DAYS, POST_SEQUENCE_STAGES, VIDEO_FOLLOWUP_DAYS,
  daysUntilDue, isDueProspect, applyNextAction, getLastSentNumber,
  daysSinceContact, pastDueDays,
} from './due.mjs';
import {
  parseEmailSequence, parseVideoReasons, parseSentEmail, buildSentEmail,
} from './prospect-parse.mjs';
import { COUNTRY_META, normalizeCountry } from './country-meta.mjs';
import { normalizeRating } from './stage-meta.mjs';
import { warmWaiting, dueAuto } from './today.mjs';
import { appendEntry, parseLog } from './activity-log.mjs';
import { finalizeWriteApi } from './bloom-result.mjs';
import { computeStats } from './prospect-stats.mjs';

// The one host a finished video may live on. setVideoUrl rejects anything else
// so a stray link (a Loom share, a localhost path) can never reach an email.
// Mirrors VIDEO_BASE_URL in wrangler.toml, with the /video/ prefix the render
// service uploads under.
export const VIDEO_URL_PREFIX = 'https://file.gobloomwired.com/video/';

// Serializable shape returned by window.bloom.getProspects(). Aliases
// business_name → business per the automation spec, and adds two computed
// fields the agent uses to make decisions without re-deriving them.
export function enrichProspect(p) {
  if (!p) return null;
  return {
    id: p.id,
    // Explicitly null rather than passed through. The list endpoint omits null
    // fields from the wire — a third of that response was the word "null"
    // repeated across four thousand rows — so these arrive as undefined, and
    // anything comparing to null (including the automation skills) should not
    // have to care which of the two it got.
    name: p.name ?? null,
    business: p.business_name ?? null,
    business_name: p.business_name ?? null,
    email: p.email ?? null,
    domain: p.domain ?? null,
    rating: p.rating ?? null,
    stage: p.stage || 'New',
    emails_sent: p.emails_sent ?? 0,
    days_ago: daysBetween(p.last_contact_date),
    last_contact_date: p.last_contact_date ?? null,
    // Unchanged: the daily-sweep automations read this. Do not rename/move.
    claude_chat_link: p.claude_chat_link ?? null,
    gmail_labels: p.gmail_labels ?? null,
    country: p.country ?? null,
    email_sequence: parseEmailSequence(p.email_sequence),
    audit_notes: p.audit_notes ?? null,
    pdf_filename: p.pdf_filename ?? null,
    info: p.info || null,
    review_url: p.review_url || null,
    video_url: p.video_url || null,
    video_tier: p.video_tier || null,
    video_score: p.video_score ?? null,
    // Stored as a JSON array of short strings; parsed back to an array here,
    // or [] if empty/unparseable, so callers never have to guard the shape.
    video_reasons: parseVideoReasons(p.video_reasons),
    video_sent_at: p.video_sent_at ?? null,
    // The one-off sends, parsed to { subject, body, sent_at } or null.
    video_sent_email: parseSentEmail(p.video_sent_email),
    playbook_sent_email: parseSentEmail(p.playbook_sent_email),
    replied: p.replied ? 1 : 0,
    reply_date: p.reply_date ?? null,
    reply_type: p.reply_type ?? null,
    replied_at_email: p.replied_at_email ?? null,
    next_action_date: p.next_action_date ?? null,
    source: p.source ?? null,
    // Representative IANA timezone for the country, so the automation can
    // compute local send times without its own lookup table. null if the
    // prospect has no country set.
    timezone: p.country && COUNTRY_META[p.country] ? COUNTRY_META[p.country].tz : null,
    due: isDueProspect(p),
  };
}

// The identity fields a prescreen can fill in, mapped to the columns that
// already exist. `website` writes to `domain` rather than adding a second
// column meaning the same thing. Country is not here because it has its own
// normalizer (GB → UK, and a hard list of valid codes).
export const IDENTITY_FIELDS = {
  name: { column: 'name', max: 120 },
  business: { column: 'business_name', max: 160 },
  website: { column: 'domain', max: 255 },
};

// Trim, then refuse anything empty or absurdly long. Rejecting rather than
// quietly storing '' matters here: an empty write would erase a real value.
export function cleanIdentityValue(field, raw, max) {
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    throw new Error(`setFields: ${field} must be a string`);
  }
  const value = String(raw).trim();
  if (!value) throw new Error(`setFields: ${field} cannot be empty`);
  if (value.length > max) {
    throw new Error(`setFields: ${field} is longer than ${max} characters`);
  }
  return value;
}

/**
 * Build the window.bloom automation surface against the component's
 * in-memory canonical store. Reads are synchronous (the store IS the truth
 * — the same array the table renders from). Writes go through the shared
 * write path used by the UI dropdowns, so the table stays in sync.
 *
 * Lookups are by email, case-insensitive. Lookups by email scan the
 * in-memory array, so they're effectively O(n) on ~300 rows = negligible.
 *
 * Return shapes:
 *   getProspects()             → Prospect[]       (synchronous; every row, ignoring filters/search)
 *   getDueAuto()               → Prospect[]       (synchronous; the sweep's list: Email 1-5 due + video owed)
 *   getWarmWaiting()           → Prospect[]       (synchronous; "Needs you" human worklist, oldest waiting first)
 *   getDue({days, stages})     → Prospect[]       (synchronous; default = Email 1-3 ∧ days_ago ≥ 3)
 *   findByEmail(email)         → Prospect|null    (synchronous)
 *   setStage(email, stage)     → Promise<Prospect> (auto-stamps last_contact_date + bumps emails_sent on AUTO_EMAIL_STAGES)
 *   markReplied(email)         → Promise<Prospect> (sets stage='Replied', does NOT stamp last_contact_date or bump emails_sent)
 *   setRating(email, rating)   → Promise<Prospect>
 *   setLastContact(email, iso) → Promise<Prospect>
 *   addLog(email, tag, text)   → Promise (appends {ts,tag,text} to the activity log)
 *   getLog(email)              → Entry[]|null      (synchronous; chronological, oldest first)
 *   setChatLink(email, url)    → Promise<Prospect>
 *   stageSequence(key)         → Promise<{packageId,band,emails}> (stored sequence → READY_FOR_APPROVAL package; no send, no model)
 *   stageVideo(key, {subject, body}) → Promise<{packageId,tier,unverified}> (one-off video delivery → READY_FOR_APPROVAL; refused without a real unsent recording)
 *   refresh()                  → Promise<void>    (re-pulls the canonical store from the server)
 *
 * All write methods throw `Error('Prospect not found: <email>')` if the
 * email doesn't match. setStage / setRating throw on invalid values.
 *
 * @param {object} bridge
 * @param {string[]} bridge.stages              valid stage names
 * @param {string[]} bridge.ratings             valid rating emoji
 * @param {Set<string>} bridge.autoEmailStages  stages that auto-stamp + bump
 * @param {() => Prospect[]} bridge.getAllProspects   live reader over the canonical store
 * @param {(id, patch) => Promise<Prospect>} bridge.updateProspectById   shared write path with the UI
 * @param {() => Promise<void>} bridge.refresh  reloads the canonical store
 */
export function makeBloomApi({
  stages,
  ratings,
  countries,
  sources,
  replyTypes,
  autoEmailStages,
  getAllProspects,
  updateProspectById,
  createProspect,
  refresh,
}) {
  // Email lookups used to scan the whole array per call, which an automation
  // loop turns into O(n²) across 5,500 rows. The index is keyed by the store
  // array's identity: every write path replaces the array (immutable), so a
  // stale index is impossible and invalidation is free via WeakMap.
  const _emailIndex = new WeakMap();
  function emailIndexFor(arr) {
    let idx = _emailIndex.get(arr);
    if (!idx) {
      idx = new Map();
      for (const p of arr) {
        const k = (p.email || '').trim().toLowerCase();
        // First row wins on duplicates, matching the old .find() behavior.
        if (k && !idx.has(k)) idx.set(k, p);
      }
      _emailIndex.set(arr, idx);
    }
    return idx;
  }
  function findRaw(email) {
    if (!email) return null;
    // Case-insensitive AND whitespace-tolerant: a copy-pasted address often
    // carries a leading space or trailing newline, and that must still match.
    const wanted = String(email).trim().toLowerCase();
    if (!wanted) return null;
    return emailIndexFor(getAllProspects()).get(wanted) || null;
  }
  async function patchByEmail(email, patch) {
    const p = findRaw(email);
    if (!p) throw new Error(`Prospect not found: ${email}`);
    const updated = await updateProspectById(p.id, patch);
    return enrichProspect(updated);
  }
  // Every setter above is keyed by email, which cannot reach the rows the
  // prescreen actually works on: a fresh scan find often has no email yet, and
  // finding one is half the point of the pass. So the identity setters take a
  // key that is either the row id or the email. Added alongside rather than
  // inside findRaw so no existing method changes behaviour.
  function resolveRaw(key) {
    if (key == null || key === '') return null;
    const asId =
      typeof key === 'number'
        ? key
        : /^\d+$/.test(String(key).trim())
          ? Number(String(key).trim())
          : null;
    if (asId != null) return getAllProspects().find((p) => p.id === asId) || null;
    return findRaw(key);
  }
  async function patchByKey(key, patch) {
    const p = resolveRaw(key);
    if (!p) throw new Error(`Prospect not found: ${key}`);
    const updated = await updateProspectById(p.id, patch);
    return enrichProspect(updated);
  }

  // getProspects enriches every row (aliases + computed fields); at 5,500
  // rows that's real work an automation may trigger many times per tick.
  // Cached per store-array identity, same invalidation story as the email
  // index: any write replaces the array, so the cache can never go stale.
  const _enrichCache = new WeakMap();

  const __bloomApi = {
    // ----- Read (synchronous — the store is the truth) -----
    getProspects() {
      const arr = getAllProspects();
      let out = _enrichCache.get(arr);
      if (!out) {
        out = arr.map(enrichProspect);
        _enrichCache.set(arr, out);
      }
      return out;
    },
    // The sweep's worklist: Email 1-5 due by cadence + rows still owed a
    // video. Same row shape as getProspects. Does NOT touch getDue/p.due.
    getDueAuto() {
      return dueAuto(getAllProspects(), daysUntilDue).map(enrichProspect);
    },
    // The "Needs you" human worklist the dashboard card and Today section
    // show: warm leads gone quiet, Snoozed/deferred that came due, Setup
    // Check, and any other due row the sweep doesn't own. Oldest-waiting
    // first, same row shape as getProspects.
    getWarmWaiting() {
      return warmWaiting(getAllProspects(), {
        daysSince: daysSinceContact,
        pastDue: pastDueDays,
        dueFn: daysUntilDue,
      }).map(({ prospect }) => enrichProspect(prospect));
    },
    // Default behavior: uses per-stage thresholds (Email 1→3d, 2→5d,
    // 3→7d, 4→7d). Callers can override with a flat `days` and a custom
    // `stages` list to force uniform behavior (e.g. sweep every stage
    // touched in the last N days).
    getDue({ days, stages: stagesArg } = {}) {
      if (days == null && stagesArg == null) {
        return getAllProspects().filter(isDueProspect).map(enrichProspect);
      }
      const stageSet = new Set(stagesArg || DEFAULT_DUE_STAGES);
      const threshold = days ?? 3;
      return getAllProspects()
        .filter((p) => stageSet.has(p.stage))
        .filter((p) => {
          const d = daysBetween(p.last_contact_date);
          return d != null && d >= threshold;
        })
        .map(enrichProspect);
    },
    findByEmail(email) {
      const p = findRaw(email);
      return p ? enrichProspect(p) : null;
    },
    // 4,481 of the rows have no email yet, which put them out of reach of
    // every email-keyed read. The id is on every row (and on every
    // getProspects result), so automation can address the whole database.
    // Writes for these rows go through setFields/setName/setBusiness, which
    // already accept an id as the key.
    findById(id) {
      const p = resolveRaw(id);
      return p ? enrichProspect(p) : null;
    },
    getStats() {
      return computeStats(getAllProspects());
    },

    // ----- Create -----
    // Creates a prospect through the same POST the UI form uses, then pushes
    // it into the canonical store so the table updates without a refetch.
    // Email is required (the whole API is email-keyed) and must be unique.
    async addProspect(data = {}) {
      const email = String(data.email ?? '').trim();
      if (!email) throw new Error('addProspect: email is required');
      if (findRaw(email)) throw new Error(`Prospect already exists: ${email}`);

      const country = normalizeCountry(data.country, countries);
      // Omitting `rating` defaults to Strong; passing null explicitly clears it.
      const rating =
        data.rating === undefined ? '💚' : normalizeRating(data.rating, ratings);
      const chatLink = data.chat_link ?? data.claude_chat_link ?? '';

      const created = await createProspect({
        name: data.name ?? '',
        business_name: data.business ?? data.business_name ?? null,
        email,
        domain: data.domain ?? '',
        country,
        claude_chat_link: String(chatLink).trim() || null,
        rating,
        stage: 'New',
        emails_sent: 0,
        last_contact_date: null,
      });
      return enrichProspect(created);
    },

    // ----- Identity fields (what a prescreen fills in) -----
    // `key` is the row id OR the email, because these rows often have no email
    // yet. Everything else on window.bloom stays email-keyed.
    //
    // A prescreen is a guess, so anything already filled in wins by default: a
    // field holding a value is left alone and named in `skipped`, and only an
    // explicit { overwrite: true } replaces it. Nothing Ary typed is ever
    // silently overwritten by a robot.
    //
    // Returns { prospect, set, skipped } rather than a bare prospect, since the
    // caller needs to know which of its guesses actually landed.
    async setFields(key, fields = {}, { overwrite = false } = {}) {
      const p = resolveRaw(key);
      if (!p) throw new Error(`Prospect not found: ${key}`);
      if (!fields || typeof fields !== 'object') {
        throw new Error('setFields: fields must be an object');
      }

      const patch = {};
      const set = {};
      const skipped = {};

      for (const [field, spec] of Object.entries(IDENTITY_FIELDS)) {
        if (fields[field] === undefined) continue;
        const value = cleanIdentityValue(field, fields[field], spec.max);
        const current = (p[spec.column] ?? '').toString().trim();
        if (current && !overwrite) {
          skipped[field] = current;
          continue;
        }
        patch[spec.column] = value;
        set[field] = value;
      }

      // Country runs through the same normalizer setCountry uses, so 'gb' and
      // 'CAD' land the same way here as they do there, and an invalid code
      // throws rather than being written.
      if (fields.country !== undefined) {
        const value = normalizeCountry(fields.country, countries);
        if (value == null) throw new Error('setFields: country cannot be empty');
        const current = (p.country ?? '').toString().trim();
        if (current && !overwrite) skipped.country = current;
        else {
          patch.country = value;
          set.country = value;
        }
      }

      // Nothing to write is a normal outcome (every guess was already filled),
      // so this returns the untouched row rather than making the caller catch.
      const prospect = Object.keys(patch).length
        ? await patchByKey(key, patch)
        : enrichProspect(p);
      // Envelope-shaped so the reliability wrapper passes it through unchanged
      // (see finalizeWriteApi): `ok` satisfies the setter contract while
      // `set`/`skipped` stay at the top level, where prescreens read them.
      return { ok: true, field: 'fields', value: fields, prospect, set, skipped };
    },
    async setName(key, name, opts) {
      return this.setFields(key, { name }, opts);
    },
    async setBusiness(key, business, opts) {
      return this.setFields(key, { business }, opts);
    },

    // ----- Write -----
    async setStage(email, stage) {
      if (!stages.includes(stage)) {
        throw new Error(`Invalid stage: ${stage}. Valid: ${stages.join(', ')}`);
      }
      const p = findRaw(email);
      if (!p) throw new Error(`Prospect not found: ${email}`);
      const patch = { stage };
      // The date drives the cadence and the timestamp answers what the date
      // cannot: which hour a send earns replies at. Written together so they
      // can never disagree about which day it was.
      //
      // UTC, not a local reading. The prospect's own clock is this plus their
      // country's offset, and an offset can be applied afterwards where a local
      // time taken from whichever machine ran the sweep could not be undone.
      if (autoEmailStages.has(stage)) {
        patch.last_contact_date = todayIso();
        patch.last_contact_at = new Date().toISOString();
        patch.emails_sent = (p.emails_sent || 0) + 1;
        // Advance the follow-up to the next send, clearing any stale date.
        applyNextAction(patch, stage, p);
      } else if (STAMP_ONLY_STAGES.has(stage)) {
        // Anchor the come-back countdown to now (e.g. Snoozed → due in ~30d).
        patch.last_contact_date = todayIso();
        patch.last_contact_at = new Date().toISOString();
      }
      const updated = await updateProspectById(p.id, patch);
      return enrichProspect(updated);
    },
    async markReplied(email) {
      const p = findRaw(email);
      if (!p) throw new Error(`Prospect not found: ${email}`);
      // Explicit: stage='Replied' only. No last_contact_date stamp, no
      // emails_sent bump — Replied means *they* sent something, not us.
      const updated = await updateProspectById(p.id, { stage: 'Replied' });
      return enrichProspect(updated);
    },
    async setRating(email, rating) {
      if (rating != null && !ratings.includes(rating)) {
        throw new Error(`Invalid rating: ${rating}. Valid: ${ratings.join(' ')}`);
      }
      return patchByEmail(email, { rating });
    },
    async setCountry(email, country) {
      // Accept null/'' to clear; 'gb'/'cad' normalize like addProspect's.
      return patchByEmail(email, { country: normalizeCountry(country, countries) });
    },
    setLastContact(email, iso) {
      return patchByEmail(email, { last_contact_date: iso || null });
    },
    setChatLink(email, url) {
      return patchByEmail(email, { claude_chat_link: url || null });
    },

    // ----- Email sequence storage -----
    // sequence: [{ number, subject, body }, ...] (up to 5). Stored as a JSON
    // string because D1 has no native JSON type. Body whitespace is preserved
    // verbatim — no trimming.
    async setEmailSequence(email, sequence) {
      if (!Array.isArray(sequence)) {
        throw new Error('setEmailSequence: sequence must be an array');
      }
      sequence.forEach((e, i) => {
        if (!e || typeof e !== 'object') {
          throw new Error(`setEmailSequence: entry ${i} is not an object`);
        }
        if (typeof e.number !== 'number') {
          throw new Error(`setEmailSequence: entry ${i} missing numeric "number"`);
        }
        if (typeof e.subject !== 'string' || typeof e.body !== 'string') {
          throw new Error(`setEmailSequence: entry ${i} needs string "subject" and "body"`);
        }
        // Optional video variants of the subject/body, used by the sweep when a
        // video link exists at send time. When present they must be strings;
        // when absent the email is unchanged. Stored as-is by JSON.stringify.
        if (e.subject_video !== undefined && typeof e.subject_video !== 'string') {
          throw new Error(`setEmailSequence: entry ${i} "subject_video" must be a string`);
        }
        if (e.body_video !== undefined && typeof e.body_video !== 'string') {
          throw new Error(`setEmailSequence: entry ${i} "body_video" must be a string`);
        }
      });
      return patchByEmail(email, { email_sequence: JSON.stringify(sequence) });
    },
    // Turn the stored sequence into a READY_FOR_APPROVAL package, so the
    // skill-written emails ride the same approval and guarded-send machinery
    // as everything else. Creates a package and nothing more: no send, no
    // approval, no model call. The server trims to the band's V2 allowance
    // and refuses with a plain reason (already contacted, replied, live
    // package waiting, sequence shorter than the allowance, corporate
    // phrasing) — thrown here so a skill loop sees which prospect and why.
    // Stage a one-off video delivery: the recording already exists and was
    // already offered, so this gives it a package to wait in rather than a
    // text file to be pasted from. Creates a package and nothing else. The
    // server refuses without a real unsent recording, so this cannot be used
    // to reach somebody whose sequence is over.
    async stageVideo(key, { subject, body } = {}) {
      const p = resolveRaw(key);
      if (!p) throw new Error(`Prospect not found: ${key}`);
      if (!subject || !body) throw new Error('stageVideo: subject and body are required');
      const res = await fetch(`/api/prospects/${p.id}/stage-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        throw new Error(`stageVideo ${p.email || p.id}: ${json.error || `HTTP ${res.status}`}`);
      }
      return json;
    },
    async stageSequence(key) {
      const p = resolveRaw(key);
      if (!p) throw new Error(`Prospect not found: ${key}`);
      const res = await fetch(`/api/prospects/${p.id}/stage-sequence`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        throw new Error(`stageSequence ${p.email || p.id}: ${json.error || `HTTP ${res.status}`}`);
      }
      return json;
    },
    // Patch a single email's subject/body, leaving the rest of the sequence
    // (and any extra fields like `day`) untouched. Immutable — never mutates
    // the objects held in the store.
    async updateEmail(prospectEmail, emailNumber, { subject, body } = {}) {
      const p = findRaw(prospectEmail);
      if (!p) throw new Error(`Prospect not found: ${prospectEmail}`);
      const seq = parseEmailSequence(p.email_sequence);
      if (!Array.isArray(seq) || seq.length === 0) {
        throw new Error(`No sequence found for ${prospectEmail}`);
      }
      const idx = seq.findIndex((e) => e.number === emailNumber);
      if (idx === -1) {
        throw new Error(`Email ${emailNumber} not found in sequence`);
      }
      const next = seq.map((e, i) =>
        i === idx
          ? {
              ...e,
              ...(subject !== undefined ? { subject } : {}),
              ...(body !== undefined ? { body } : {}),
            }
          : e
      );
      return this.setEmailSequence(prospectEmail, next);
    },
    async setAuditNotes(email, notes) {
      return patchByEmail(email, { audit_notes: notes || null });
    },
    async setPdfFilename(email, filename) {
      return patchByEmail(email, { pdf_filename: filename || null });
    },
    // Synchronous read of the parsed sequence (or null).
    getEmailSequence(email) {
      const p = findRaw(email);
      return p ? parseEmailSequence(p.email_sequence) : null;
    },
    // Synchronous read of one email by its number (1-5), or null.
    getEmailByNumber(email, number) {
      const seq = this.getEmailSequence(email);
      if (!Array.isArray(seq)) return null;
      return seq.find((e) => e.number === number) || null;
    },

    // ----- Info (freeform audit notes: niche, location, services, findings) -----
    async setInfo(email, text) {
      return patchByEmail(email, { info: text || null });
    },
    getInfo(email) {
      const p = findRaw(email);
      return p?.info || null;
    },

    // ----- Activity log (the info-marker habit, given a real home) -----
    // Appends { ts, tag, text } to the activity_log JSON column. info is
    // untouched — the legacy PRESCREEN/REPLYSYNC/VIDTEST/DECLINED markers
    // keep working and the drawer renders both into one timeline.
    async addLog(email, tag, text) {
      const p = findRaw(email);
      if (!p) throw new Error(`Prospect not found: ${email}`);
      return patchByEmail(email, { activity_log: appendEntry(p.activity_log, tag, text) });
    },
    // Synchronous read of the parsed log (chronological, oldest first).
    getLog(email) {
      const p = findRaw(email);
      return p ? parseLog(p.activity_log) : null;
    },

    // ----- Video (audit-video worthiness — the Video column) -----
    // Set by auto-prospect when the audit finds something worth recording.
    // Tiers: SEND (something visibly broken, worth the credits), MAYBE (small
    // stuff, look before spending), NO_VIDEO (site is fine — not a mark against
    // them, they stay in the email sequence), BLOCKED (site refused to load, so
    // it could not be judged). score is the weighted finding total behind the
    // tier, used only for sorting. Passing tier null clears the cell.
    async setVideo(email, tier, score = null, reasons) {
      const valid = ['SEND', 'MAYBE', 'NO_VIDEO', 'BLOCKED'];
      if (tier != null && !valid.includes(tier)) {
        throw new Error(`Invalid video_tier: ${tier}. Valid: ${valid.join(', ')}`);
      }
      if (reasons !== undefined && reasons !== null && !Array.isArray(reasons)) {
        throw new Error('setVideo: reasons must be an array of strings');
      }
      return patchByEmail(email, {
        video_tier: tier || null,
        ...(score != null ? { video_score: Number(score) } : {}),
        // Only touch reasons when the caller passed them, so a later tier update
        // does not wipe the list. Pass [] explicitly to clear it.
        ...(reasons !== undefined
          ? { video_reasons: reasons && reasons.length ? JSON.stringify(reasons) : null }
          : {}),
      });
    },
    getVideo(email) {
      const p = findRaw(email);
      if (!p) return null;
      return {
        tier: p.video_tier || null,
        score: p.video_score ?? null,
        url: p.video_url || null,
        reasons: parseVideoReasons(p.video_reasons),
        sentAt: p.video_sent_at ?? null,
      };
    },
    // The finished video's hosted link. Only file.gobloomwired.com/video/ is
    // allowed — the same guard that keeps a wrong host out of an email. Passing
    // null or '' clears it (e.g. re-recording).
    async setVideoUrl(email, url) {
      const clean = url == null ? '' : String(url).trim();
      if (clean && !clean.startsWith(VIDEO_URL_PREFIX)) {
        throw new Error(`setVideoUrl: url must start with ${VIDEO_URL_PREFIX}`);
      }
      const patch = { video_url: clean || null };
      // A prospect who finished the sequence has no stage cadence, so a video
      // that lands now would never surface on its own. Setting a real link puts
      // them in Due today five days out for the one-off video email.
      //
      // The date only ever moves closer. Nothing scheduled, or something parked
      // further out than the video send, gets pulled in to five days. A date
      // already sooner than that is left alone, because it would surface the
      // prospect before the video would anyway and pushing it back would delay
      // a follow-up that was deliberately set.
      if (clean) {
        const p = findRaw(email);
        if (p && POST_SEQUENCE_STAGES.has(p.stage)) {
          const target = isoShift(VIDEO_FOLLOWUP_DAYS);
          const current = p.next_action_date == null ? '' : String(p.next_action_date).trim();
          // ISO dates, so a string compare is a date compare.
          if (!current || current > target) {
            patch.next_action_date = target;
          }
        }
      }
      return patchByEmail(email, patch);
    },
    getVideoUrl(email) {
      const p = findRaw(email);
      return p?.video_url || null;
    },
    // Stamp the day the video email variant went out. The sweep calls this right
    // after sending so the same video is never sent twice.
    async markVideoSent(email) {
      // Clears the follow-up too. A one-off video email to a past-Email-5
      // prospect is the last automated action there is, and its send date was
      // set five days out by setVideoUrl to surface the row. Left in place it
      // sat in the past forever and the prospect never left the due list. A
      // mid-sequence video variant clears it too, harmlessly: that stage still
      // has its own cadence off last_contact_date to fall back on.
      return patchByEmail(email, { video_sent_at: todayIso(), next_action_date: null });
    },
    // The two emails that never lived in the sequence, stored by the sweep
    // right after a confirmed send (alongside markVideoSent for the video one)
    // so what the prospect actually received is on the record. Read them back
    // with findByEmail / getProspects, where they come out parsed.
    async setVideoSentEmail(email, subject, body) {
      // Stamps the date as well as the record, in the one write.
      //
      // These were two calls, markVideoSent and this one, and the date is what
      // stops the next email in the sequence sending the video a second time.
      // A tab closed or a connection dropped between them left the copy of the
      // email on the record and no date beside it, and the sweep would send it
      // again on the following email.
      //
      // Doing both here makes either call sufficient on its own. The sweep may
      // keep calling both, which is harmless: the date it writes is the same
      // day.
      return patchByEmail(email, {
        video_sent_email: buildSentEmail('setVideoSentEmail', subject, body, todayIso()),
        video_sent_at: todayIso(),
        // Same reason as markVideoSent: the one-off send is the last automated
        // action, so its scheduling date clears rather than stranding the row.
        next_action_date: null,
      });
    },
    // The send itself, reported back after Gmail confirms it.
    //
    // The product does not send: the sweep skill does, from a real mailbox. So
    // until now the database's last word on any prospect was that a package had
    // been APPROVED, and approved is not sent. Every question shaped like "how
    // long until it went out" or "did that one actually go" had no answer, and
    // treating an approval as a send would have inflated every funnel silently.
    //
    // Safe to call twice. The server deduplicates on the provider message id
    // where one is available and on prospect-step-day otherwise, so a retry
    // after a dropped connection is one send, not two. The response says which
    // it was, because the sweep should report a duplicate rather than hide it.
    async recordSend(email, { step = null, subject = null, messageId = null, threadId = null, sentAt = null } = {}) {
      const p = findRaw(email);
      if (!p) throw new Error(`Prospect not found: ${email}`);
      const res = await fetch('/api/outreach/sent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectId: p.id, sequenceStep: step, subject, messageId, threadId, sentAt }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `recordSend failed: HTTP ${res.status}`);
      return { ok: true, recorded: Boolean(json.recorded), duplicate: Boolean(json.duplicate), sends: json.sends };
    },
    async setPlaybookSentEmail(email, subject, body) {
      return patchByEmail(email, {
        playbook_sent_email: buildSentEmail('setPlaybookSentEmail', subject, body, todayIso()),
      });
    },

    // ----- Review PDF (hosted on R2, served at /review/{slug}) -----
    async setReviewUrl(email, url) {
      return patchByEmail(email, { review_url: url || null });
    },
    getReviewUrl(email) {
      const p = findRaw(email);
      return p?.review_url || null;
    },

    // ----- Reply tracking / next action / source -----
    // A reply is an attribute of the lead, independent of stage. Marking a
    // reply stamps reply_date (today, unless already set) and captures the
    // email number they were on, so "replies by email" can be reported.
    async setReplied(email, bool) {
      const p = findRaw(email);
      if (!p) throw new Error(`Prospect not found: ${email}`);
      if (bool) {
        return patchByEmail(email, {
          replied: 1,
          reply_date: p.reply_date || todayIso(),
          reply_at: p.reply_at || new Date().toISOString(),
          replied_at_email: p.replied_at_email ?? getLastSentNumber(p),
        });
      }
      return patchByEmail(email, { replied: 0 });
    },
    // Setting a type implies replied=true; null clears the reply.
    async setReplyType(email, type) {
      if (type != null && !replyTypes.includes(type)) {
        throw new Error(`Invalid reply_type: ${type}. Valid: ${replyTypes.join(', ')}`);
      }
      const p = findRaw(email);
      if (!p) throw new Error(`Prospect not found: ${email}`);
      if (type == null) {
        return patchByEmail(email, { reply_type: null, replied: 0 });
      }
      return patchByEmail(email, {
        reply_type: type,
        replied: 1,
        reply_date: p.reply_date || todayIso(),
        replied_at_email: p.replied_at_email ?? getLastSentNumber(p),
      });
    },
    async setReplyDate(email, date) {
      return patchByEmail(email, { reply_date: date || null });
    },
    async setNextActionDate(email, date) {
      return patchByEmail(email, { next_action_date: date || null });
    },
    async setSource(email, source) {
      if (source != null && source !== '' && !sources.includes(source)) {
        throw new Error(`Invalid source: ${source}. Valid: ${sources.join(', ')}`);
      }
      return patchByEmail(email, { source: source || null });
    },

    // ----- UI -----
    refresh,

    // ----- Constants (handy for the caller) -----
    stages: [...stages],
    ratings: [...ratings],
    countries: [...countries],
    sources: [...sources],
    replyTypes: [...replyTypes],
    // code → IANA timezone, so the automation can time sends per prospect.
    COUNTRY_TIMEZONES: Object.fromEntries(
      Object.entries(COUNTRY_META).map(([code, m]) => [code, m.tz])
    ),
    AUTO_EMAIL_STAGES: [...autoEmailStages],
    DEFAULT_DUE_STAGES: [...DEFAULT_DUE_STAGES],
    DUE_DAYS_BY_STAGE: { ...DUE_DAYS_BY_STAGE },
    FINISHED_AFTER_DAYS,
  };

  // Every setter now resolves to { ok, field, value, prospect } (or
  // { ok:false, error } + a console.warn) instead of a bare prospect, so a
  // missed write can't pass for a silent success. Reads/constants untouched.
  return finalizeWriteApi(__bloomApi);
}
