// The job handlers, and the loop that runs them.
//
// Lives here rather than in a route so the cron path and the manual drain run
// exactly the same code. Two copies of this would be two prospecting engines
// that disagree, which is the thing SKILLS-PRODUCT-MAP.md exists to prevent
// between the app and the skills; it would be worse inside the app itself.
//
// Every handler is safe to run twice. That contract is what makes retries
// free: a crashed worker's job comes back, runs again, and does not pay for
// anything it already bought.

import { claimNext, complete, fail, classifyError, queueSummary, enqueue, inFlightCount, release, KIND, ERROR_KIND, PRIORITY } from './queue.mjs';

// How many site checks are out with a worker, anywhere.
const scannerInFlight = (db) => inFlightCount(db, KIND.SCANNER_ITEM);
import { prescreen, buildVetResult, VERDICT } from './vet.mjs';
import { buildSiteIntel, isFresh, isThorough } from './site-intel.mjs';
import { gatherSiteSignals } from './signals.mjs';
import { shouldProbe } from './renderability.mjs';
import { canSpendAutomatically, recordAutoSpend, estimateCost, loadAutoLimits, autoSpentToday } from './auto-budget.mjs';
import { loadCredits, spendCredits, refundCredits, OUT_OF_CREDITS } from './credits.mjs';
import { runPrecheck, PRECHECK_OUTCOME } from './precheck.mjs';
import {
  ITEM, markItemRunning, finishItem, syncRunCounters, settleIfFinished, stopRun,
  SCANNER_CONCURRENCY, SCANNER_BUDGET_MS, SCANNER_WAVE_RESERVE_MS,
} from './scanner-items.mjs';
import { askBackground, loadAiKey } from './ai-call.mjs';
import { modelForTask } from './ai-cost.mjs';
import { buildClassifyParts, parseClassifyResult, actionFor, REPLY, REAL_REPLY, NEEDS_HUMAN } from './reply-classify.mjs';
import { applyReplyToProspect } from './reply-apply.mjs';
// Eligibility and the draft-already-waiting check stay in followup.mjs; the
// writing itself is the V2 generator, shared with Today's shadow preview so
// there is one set of rules rather than a live one and a rehearsal one.
import { canPrepareFollowUp, parseFollowUp } from './followup.mjs';
import {
  nextFollowupStep, firstEmailOf, buildFollowupParts, parseFollowup, validateFollowup,
} from './followup-v2.mjs';
import {
  planPackage, buildEmailParts, validateOutreachEmail, ensureSignOff,
  ACTIONABLE_STATUSES, missingSequenceSteps, STATUS, NO_SAFE_ANGLE, GENERATOR_VERSION,
} from './outreach.mjs';
import { PLAYBOOK_VERSION } from './playbooks.mjs';
import { PRICES } from './credits.mjs';
import { rankOne } from './pick.mjs';
import { syncMailbox } from './gmail-sync.mjs';
import { getAccount, accessTokenFor, recordWatch, needsRenewal, listAccounts } from './gmail-store.mjs';
import { mailboxHealth } from './mailbox-health.mjs';
import { startWatch } from './gmail.mjs';
import { DEFAULT_ENGINE_SETTINGS } from './engine-prompts.mjs';
import { recordOutcome, snapshot, KIND as OUTCOME } from './outcomes.mjs';
import { sendApproved } from './send-runner.mjs';
import { mayAutoFollowUp } from './auto-followup.mjs';
import { autoFollowupCandidate, sendJobFor, SKIP } from './followup-scheduler.mjs';
import { sendPolicy } from './send-policy.mjs';
import { preparationAllowance } from './backlog.mjs';
import { discoverContact, RESULT, FETCH_TIMEOUT_MS } from './contact-job.mjs';
import { saveDiscovery, resumeLifecycle } from './contact-save.mjs';

// One page, with a ceiling and a real user agent. Never throws: a site that
// will not load is an answer about the site, not an exception.
async function fetchPageForContact(url) {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
        accept: 'text/html',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, status: res.status };
    const buf = await res.arrayBuffer();
    return { ok: true, status: res.status, html: new TextDecoder().decode(buf.slice(0, 500_000)) };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}
import { canProgressOutbound, isReadyToReconsider, STOP } from './outbound.mjs';
import { appendEntry } from './activity-log.mjs';
import { PROSPECT_COLUMNS } from './columns.mjs';
import {
  eligibleLateFollowup, buildLateFollowupParts, parseLateFollowup, validateLateFollowup,
  lateFollowupPackageFields, pilotDraftCount, lateFollowupPilotCap, LATE_FOLLOWUP_STEP,
  LATE_FOLLOWUP_GENERATOR_VERSION,
} from './late-followup.mjs';
import { conversationForReading } from './conversation-store.mjs';
import { recordSend, VIA } from './send-events.mjs';

const loadProspect = (db, id, ws) =>
  db.prepare(`SELECT ${PROSPECT_COLUMNS} FROM prospects WHERE id = ? AND workspace = ? AND deleted_at IS NULL`).bind(id, ws).first();

// Written on the prospect so automation is never invisible. Plain words, in
// the same timeline as everything a person does, never queue internals.
async function note(db, ws, id, text) {
  const row = await db.prepare('SELECT activity_log FROM prospects WHERE id = ? AND workspace = ?').bind(id, ws).first();
  if (!row) return;
  await db
    .prepare(`UPDATE prospects SET activity_log = ?, updated_at = ? WHERE id = ? AND workspace = ?`)
    .bind(appendEntry(row.activity_log, 'auto', text), new Date().toISOString(), id, ws)
    .run()
    .catch(() => {});
}

export async function loadEngineSettings(db, workspace) {
  const row = await db.prepare(`SELECT value FROM settings WHERE workspace = ? AND key = 'engine'`).bind(workspace).first();
  let stored = {};
  if (row?.value) { try { stored = JSON.parse(row.value); } catch {} }
  return { ...DEFAULT_ENGINE_SETTINGS, ...stored };
}

function renderEnv() {
  const e = typeof process !== 'undefined' && process.env ? process.env : {};
  return { url: String(e.RENDER_URL || '').replace(/\/+$/, ''), secret: e.RENDER_SECRET };
}

export const HANDLERS = {
  // Read what changed in a connected mailbox.
  //
  // Cheap when nothing happened, which is most of the time: one history call
  // that returns an empty list. Every message that does turn up is read as
  // headers first and dropped unless something links it to a prospect.
  async [KIND.GMAIL_SYNC](db, ws, job) {
    let payload = {};
    try { payload = job.payload ? JSON.parse(job.payload) : {}; } catch {}
    const e = typeof process !== 'undefined' && process.env ? process.env : {};

    const account = payload.accountId
      ? await db.prepare(`SELECT * FROM gmail_accounts WHERE id = ? AND workspace = ?`).bind(payload.accountId, ws).first()
      : await getAccount(db, ws);
    if (!account) { const err = new Error('No mailbox is connected.'); err.permanent = true; throw err; }

    const result = await syncMailbox(db, e, account);

    // A sync that found nothing is the normal case and must not write a note
    // on anybody. Only real ingestion leaves a trace.
    return { ...result, mailbox: account.email_address, terminal: true };
  },

  // Renew the watch. Gmail drops it after seven days and a dropped watch is
  // indistinguishable from a quiet inbox, which is the failure this exists to
  // make impossible.
  async [KIND.GMAIL_WATCH](db, ws, job) {
    let payload = {};
    try { payload = job.payload ? JSON.parse(job.payload) : {}; } catch {}
    const e = typeof process !== 'undefined' && process.env ? process.env : {};
    if (!e.GMAIL_PUBSUB_TOPIC) { const err = new Error('Gmail push is not configured.'); err.permanent = true; throw err; }

    const account = payload.accountId
      ? await db.prepare(`SELECT * FROM gmail_accounts WHERE id = ? AND workspace = ?`).bind(payload.accountId, ws).first()
      : await getAccount(db, ws);
    if (!account) { const err = new Error('No mailbox is connected.'); err.permanent = true; throw err; }

    const token = await accessTokenFor(db, e, account);
    const w = await startWatch(token, { topicName: e.GMAIL_PUBSUB_TOPIC });
    await recordWatch(db, account.id, w);
    return { renewed: true, expiration: w.expiration, mailbox: account.email_address, terminal: true };
  },


  // Send one approved package, natively.
  //
  // The queue's job here is only to bring the work to a worker at a sensible
  // time. Every decision about whether the message may actually go out is made
  // inside sendApproved, in the last instant before the call, because the queue
  // was populated minutes or hours ago and the prospect may have replied since.
  async [KIND.SEND_APPROVED](db, ws, job) {
    let payload = {};
    try { payload = job.payload ? JSON.parse(job.payload) : {}; } catch {}
    const packageId = Number(payload.packageId);
    if (!packageId) { const e = new Error('No package id'); e.permanent = true; throw e; }

    const env = typeof process !== 'undefined' && process.env ? process.env : {};

    // Defence in depth, layer one: refuse an unarmed follow-up before spending
    // anything on it.
    //
    // The queue was populated minutes or hours ago, and permission can be
    // revoked in between. Checking here saves a token fetch, a mailbox health
    // call and a message build; the guard inside sendApproved asks the same
    // question again in the last instant, which is the layer that actually
    // protects the recipient.
    const isFollowup = Boolean(payload.isFollowup);
    if (isFollowup) {
      const pkg = await db
        .prepare(`SELECT * FROM outreach_packages WHERE id = ? AND workspace = ?`)
        .bind(packageId, ws).first().catch(() => null);
      const policy = sendPolicy(await loadEngineSettings(db, ws));
      const armed = mayAutoFollowUp({ pkg: pkg || {}, policy, step: Number(payload.step) || null });
      if (!armed.ok) {
        return { sent: false, block: armed.block, reason: armed.reason, terminal: true };
      }
    }

    const r = await sendApproved(db, env, {
      workspace: ws, packageId, isFollowup,
    });

    if (r.sent) {
      await recordOutcome(db, {
        workspace: ws, prospectId: payload.prospectId || null, kind: OUTCOME.OUTREACH,
        value: 'native-send', context: { packageId, step: r.step, messageId: r.messageId },
      });
      return { sent: true, messageId: r.messageId, step: r.step, terminal: true };
    }

    // A block is not a failure. "Outside the send window" and "approved four
    // minutes ago" are the normal answers, and burning a retry on the clock is
    // how a job that would have succeeded at nine gets abandoned by eight.
    if (r.retryable) {
      const e = new Error(r.reason);
      e.transient = true;
      throw e;
    }
    if (r.block === 'needs-human' || r.block === 'outcome-unknown') {
      const e = new Error(r.reason);
      e.human = true;
      throw e;
    }
    return { sent: false, block: r.block, reason: r.reason, terminal: true };
  },


  // Free. Their own public website, looking for a way to reach them.
  //
  // The job the backlog analysis asked for: 4,178 prospects had a website and
  // no address, and only fifteen contact searches had ever run in the whole
  // database. That number was not a research result, it was what happens when
  // nobody looks.
  //
  // Nothing here parses anything. The extraction library is already tested;
  // this is the part that writes the answer down and restarts the prospect.
  async [KIND.DISCOVER_CONTACT](db, ws, job) {
    const p = await loadProspect(db, job.prospect_id, ws);
    if (!p) { const e = new Error('Prospect not found'); e.permanent = true; throw e; }
    if (!p.domain) { const e = new Error('No domain'); e.permanent = true; throw e; }

    // Already answered, and the answer has not expired.
    if (p.contact_refresh_after && p.contact_refresh_after > new Date().toISOString()) {
      return { skipped: true, reason: 'Searched recently.', result: p.contact_search_result, terminal: true };
    }
    // Somebody typed an address in the meantime.
    if (String(p.email || '').trim()) {
      return { skipped: true, reason: 'They already have an address.', terminal: true };
    }

    const r = await discoverContact(p, { fetchPage: fetchPageForContact });
    const saved = await saveDiscovery(db, ws, p, r);

    let resume = null;
    if (saved.adopted) {
      const waitingRow = await db
        .prepare(`SELECT COUNT(*) n FROM outreach_packages WHERE workspace = ? AND status = 'READY_FOR_APPROVAL'`)
        .bind(ws).first().catch(() => ({ n: 0 }));
      const limits = await loadAutoLimits(db, ws).catch(() => ({}));
      const backpressure = preparationAllowance({
        readyForApproval: Number(waitingRow?.n) || 0,
        dailyDraftCap: Number(limits?.maxDraftsPerDay) || 10,
      });
      resume = await resumeLifecycle(db, ws, p.id, { backpressure });
    }

    // A technical failure is retried by the queue; a finished search is not.
    if (!saved.cached && r.result !== RESULT.SITE_DEAD) {
      const e = new Error(`Contact search could not run: ${r.result}`);
      e.transient = true;
      throw e;
    }

    return {
      result: r.result,
      pages: r.pagesChecked,
      adopted: saved.adopted,
      primary: r.primary?.value || null,
      candidates: r.candidates.length,
      other: r.other.length,
      resumed: resume?.resumed || false,
      next: resume?.next || null,
      terminal: true,
    };
  },

  // Free. Either stops here with a reason, or asks for the next stage.
  async [KIND.PRESCREEN](db, ws, job) {
    const p = await loadProspect(db, job.prospect_id, ws);
    if (!p) { const e = new Error('Prospect not found'); e.permanent = true; throw e; }

    // The workspace's own qualification rules reach the unattended path too.
    // Wiring them into prescreen and leaving the sweep calling it without
    // settings would have meant the rules only applied when somebody clicked.
    const settings = await loadEngineSettings(db, ws);
    const pre = prescreen(p, { settings });
    await recordOutcome(db, { workspace: ws, prospectId: p.id, kind: OUTCOME.VET, value: `prescreen:${pre.verdict}`, context: snapshot(p, { rule: pre.rule }) });

    if (!pre.pass) {
      await note(db, ws, p.id, `Prescreened automatically: skip. ${pre.reasons[0]}`);
      return { verdict: pre.verdict, rule: pre.rule, stopped: true };
    }
    if (!pre.needsProbe) {
      await enqueue(db, { workspace: ws, kind: KIND.VET, prospectId: p.id, priority: PRIORITY.VET });
      return { verdict: pre.verdict, rule: pre.rule, next: KIND.VET };
    }
    await enqueue(db, { workspace: ws, kind: KIND.SIGNALS, prospectId: p.id, priority: PRIORITY.SIGNALS });
    return { verdict: pre.verdict, rule: pre.rule, next: KIND.SIGNALS };
  },

  // One fetch of the prospect's own site. No credits: this is the path that
  // was previously reachable only by ad-scan leads.
  async [KIND.SIGNALS](db, ws, job) {
    const p = await loadProspect(db, job.prospect_id, ws);
    if (!p) { const e = new Error('Prospect not found'); e.permanent = true; throw e; }
    if (!p.domain) { const e = new Error('No domain'); e.permanent = true; throw e; }

    const { email, signals, status, render } = await gatherSiteSignals(p.domain);
    const found = [];
    // Never overwrite an address somebody typed; a discovered one fills a blank.
    if (email && !p.email) {
      await db.prepare(`UPDATE prospects SET email = ?, updated_at = ? WHERE id = ? AND workspace = ? AND (email IS NULL OR email = '')`)
        .bind(email, new Date().toISOString(), p.id, ws).run().catch(() => {});
      found.push(`a contact address (${email})`);
    }
    if (signals.length) {
      await db.prepare(`UPDATE prospects SET signals = ?, updated_at = ? WHERE id = ? AND workspace = ?`)
        .bind(JSON.stringify(signals.slice(0, 20)), new Date().toISOString(), p.id, ws).run().catch(() => {});
      found.push(`${signals.length} signal${signals.length === 1 ? '' : 's'}`);
    }
    if (found.length) await note(db, ws, p.id, `Read their site and found ${found.join(' and ')}.`);

    // Can a browser learn anything here? Judged on the page this stage already
    // fetched, so the decision costs nothing.
    //
    // A bot check or a 5xx still goes through: getting past a challenge is
    // exactly what a real browser is for. Only a dead address, a parking page
    // or a genuinely blank page stops here.
    //
    // What it records matters as much as what it saves. "We could not read
    // their website" is not a verdict on the business, and turning one into
    // the other is how a real prospect gets binned for having a Cloudflare
    // rule. The prospect stays open, marked unverifiable, for another source.
    if (!shouldProbe(render.verdict)) {
      const now = new Date().toISOString();
      await db
        .prepare(`UPDATE prospects SET site_intel = ?, site_intel_at = ?, site_intel_source = 'preflight', updated_at = ? WHERE id = ? AND workspace = ?`)
        .bind(
          JSON.stringify({ unverifiable: true, verdict: render.verdict, why: render.reason, status, checkedAt: now }),
          now, now, p.id, ws
        )
        .run().catch(() => {});
      await note(db, ws, p.id, `${render.reason} Nothing was spent on a site check.`);
      await recordOutcome(db, {
        workspace: ws, prospectId: p.id, kind: OUTCOME.VET,
        value: `preflight:${render.verdict}`, context: { status, reason: render.reason },
      });
      return { email: Boolean(email), signals: signals.length, preflight: render.verdict, savedCredits: estimateCost('precheck'), terminal: true };
    }

    await enqueue(db, { workspace: ws, kind: KIND.VERIFY_SITE, prospectId: p.id, priority: PRIORITY.VERIFY });
    return { email: Boolean(email), signals: signals.length, next: KIND.VERIFY_SITE };
  },

  // The paid stage. Everything before it exists so this runs rarely.
  async [KIND.VERIFY_SITE](db, ws, job) {
    const p = await loadProspect(db, job.prospect_id, ws);
    if (!p) { const e = new Error('Prospect not found'); e.permanent = true; throw e; }

    // Idempotence: a previous attempt that already stored a good probe makes
    // this a no-op rather than a second purchase.
    let existing = null;
    try { existing = p.site_intel ? JSON.parse(p.site_intel) : null; } catch {}
    if (existing && isFresh(existing) && isThorough(existing)) {
      await enqueue(db, { workspace: ws, kind: KIND.VET, prospectId: p.id, priority: PRIORITY.VET });
      return { reused: true, next: KIND.VET };
    }

    const cost = estimateCost('precheck');
    const { balance } = await loadCredits(db, ws);
    const limits = await loadAutoLimits(db, ws);
    const gate = await canSpendAutomatically(db, ws, { credits: cost, balance, limits });
    if (!gate.ok) {
      const e = new Error(gate.reason);
      // "Switched off" is permanent until somebody changes a setting; out of
      // allowance is a wait, and waiting must not burn an attempt.
      if (gate.code === 'disabled') e.permanent = true; else e.budget = true;
      throw e;
    }

    const { url: service, secret } = renderEnv();
    if (!service || !secret) { const err = new Error('Site checking is not configured'); err.permanent = true; throw err; }

    const charge = await spendCredits(db, ws, 'precheck', 1, { actor: 'auto', prospectId: p.id });
    if (!charge.ok) { const err = new Error('Out of credits'); err.budget = true; throw err; }

    let data;
    try {
      const res = await fetch(`${service}/precheck`, {
        method: 'POST',
        headers: { 'x-render-secret': secret, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: p.domain, ownFindings: [] }),
      });
      data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 422) throw new Error(data.error || `checker answered ${res.status}`);
    } catch (err) {
      // The work did not happen, so the credits go back before the throw.
      // This is the line that makes a retry free.
      await refundCredits(db, ws, charge.price).catch(() => {});
      throw err;
    }

    const intel = buildSiteIntel(data, { source: 'auto' });
    const now = new Date().toISOString();
    await db
      .prepare(`UPDATE prospects SET site_intel = ?, site_intel_at = ?, site_intel_source = 'auto',
                       video_tier = ?, video_score = ?, video_reasons = ?, updated_at = ?
                 WHERE id = ? AND workspace = ?`)
      .bind(
        JSON.stringify(intel), now,
        data.blocked ? 'BLOCKED' : (data.worth ? 'SEND' : 'NO_VIDEO'),
        Math.round(Number(data.score) || 0),
        JSON.stringify(data.reasons || []),
        now, p.id, ws
      )
      .run();

    await recordAutoSpend(db, ws, charge.price, 'precheck');
    const n = (data.reasons || []).length;
    await note(db, ws, p.id, data.blocked
      ? `Website checked: could not read their site (${data.blocked.reason}).`
      : `Website checked: ${n} verified finding${n === 1 ? '' : 's'}.`);

    await enqueue(db, { workspace: ws, kind: KIND.VET, prospectId: p.id, priority: PRIORITY.VET });
    return { findings: n, credits: charge.price, next: KIND.VET };
  },

  // One prospect out of a Hive run.
  //
  // This is the browser's old for-loop body, running on the server instead. The
  // work is identical because it is literally the same function the button
  // calls; what changed is who calls it and what happens when Ary closes the
  // tab, which is now nothing.
  //
  // Deliberately spends the credit balance and not the daily automatic
  // allowance. Ary pressed Start, so this is her money being spent on purpose;
  // routing it through the unattended budget would let a Hive run she is
  // watching get parked by the sweep's ceiling, and would make the sweep's
  // ceiling stop meaning what it says.
  async [KIND.SCANNER_ITEM](db, ws, job) {
    let payload = {};
    try { payload = job.payload ? JSON.parse(job.payload) : {}; } catch {}
    const runId = Number(payload.runId);
    const itemId = Number(payload.itemId);
    const prospectId = Number(payload.prospectId || job.prospect_id);
    if (!runId || !itemId) { const e = new Error('Not a scanner item'); e.permanent = true; throw e; }

    // The item is the authority, not the job. A run that was stopped cancelled
    // its items, so a job that slipped through the cancellation finds nothing
    // to claim and does nothing: this is the line that stops a stopped run
    // spending money.
    const claimed = await markItemRunning(db, { workspace: ws, itemId });
    if (!claimed) return { runId, itemId, skipped: 'that item is already finished or cancelled' };

    const { url: service, secret } = renderEnv();

    let out;
    try {
      out = await runPrecheck(db, { workspace: ws, prospectId, service, secret, actor: 'human' });
    } catch (err) {
      // Nothing was recorded, so the item stays where it is and the queue
      // retries it. On the last attempt it settles as failed, because an item
      // stuck at RUNNING would keep the whole run from ever finishing.
      if ((Number(job.attempts) || 1) >= (Number(job.max_attempts) || 3)) {
        await finishItem(db, { workspace: ws, itemId, state: ITEM.FAILED, error: err?.message || err });
        await syncRunCounters(db, { workspace: ws, runId });
      }
      throw err;
    }

    // Out of credits stops the run rather than failing five thousand items one
    // at a time. Every remaining item would fail for the same reason, and a
    // list of five thousand identical failures is not a report anybody can use.
    if (out.outOfCredits) {
      await finishItem(db, { workspace: ws, itemId, state: ITEM.CANCELLED, error: OUT_OF_CREDITS });
      await stopRun(db, { workspace: ws, runId, reason: OUT_OF_CREDITS });
      const e = new Error(OUT_OF_CREDITS);
      e.budget = true;
      throw e;
    }

    const failed = out.outcome === PRECHECK_OUTCOME.FAILED;
    if (failed && (Number(job.attempts) || 1) < (Number(job.max_attempts) || 3) && !out.permanent) {
      // Our end, and it might work next time. No item state written: it stays
      // RUNNING and comes back round.
      throw new Error(out.error || 'The checker could not be reached.');
    }

    await finishItem(db, {
      workspace: ws,
      itemId,
      state: failed || out.outcome === PRECHECK_OUTCOME.SKIPPED ? ITEM.FAILED : ITEM.SUCCEEDED,
      error: out.error || null,
    });

    // Doubles as the run's heartbeat. Server work happening is the liveness
    // signal now, which is what makes the stale-run reconciler mean something
    // again: no tab has to be open for a live run to look alive.
    await syncRunCounters(db, { workspace: ws, runId });
    await settleIfFinished(db, { workspace: ws, runId });

    return {
      runId,
      itemId,
      prospectId,
      outcome: out.outcome,
      tier: out.tier || null,
      credits: out.charged || 0,
    };
  },

  // Free. Reads what the earlier stages stored.
  async [KIND.VET](db, ws, job) {
    const p = await loadProspect(db, job.prospect_id, ws);
    if (!p) { const e = new Error('Prospect not found'); e.permanent = true; throw e; }

    const settings = await loadEngineSettings(db, ws);
    const result = buildVetResult(p, { settings });
    await recordOutcome(db, {
      workspace: ws, prospectId: p.id, kind: OUTCOME.VET, value: result.verdict,
      context: snapshot(p, {
        opportunity: result.opportunity.level,
        evidenceQuality: result.evidenceQuality.level,
        timing: result.timing.level,
        confidence: result.confidence,
      }),
    });
    await note(db, ws, p.id, `Vet: ${result.verdict}. ${result.why[0] || ''} Next: ${result.next}`);

    // A MAYBE is precisely the case a person should look at, so the job waits
    // rather than failing, and shows up in Today as a decision.
    if (result.verdict === VERDICT.MAYBE) {
      const e = new Error(`Ambiguous: ${result.why[0] || 'not enough to decide'}`);
      e.human = true;
      throw e;
    }

    // STRONG hands straight on. This is the link that turns qualification into
    // something Ary can act on: before it, a Strong verdict sat on a row until
    // she opened it and pressed Write Email.
    //
    // Gated by the same switch as every other automatic spend, because
    // preparing a package costs a model call.
    if (result.verdict === VERDICT.STRONG) {
      const limits = await loadAutoLimits(db, ws);
      if (limits.autoVet && limits.autoPrepareEmail !== false) {
        const q = await enqueue(db, { workspace: ws, kind: KIND.PREPARE_OUTREACH, prospectId: p.id, priority: PRIORITY.PREPARE_OUTREACH });
        return { verdict: result.verdict, next: q.queued ? KIND.PREPARE_OUTREACH : result.next, terminal: !q.queued };
      }
    }
    return { verdict: result.verdict, next: result.next, terminal: true };
  },

  // The cheap model pass on a reply the rules would not touch.
  //
  // By the time this runs the prospect is already protected: an unknown reply
  // stops outbound from `replied` alone, and Today has been showing it under
  // "a reply nobody could read" since the moment it landed. So this job can
  // only improve the label, never open a gap.
  async [KIND.CLASSIFY_REPLY](db, ws, job) {
    let payload = {};
    try { payload = job.payload ? JSON.parse(job.payload) : {}; } catch {}
    const messageId = String(payload.messageId || '');
    if (!messageId) { const e = new Error('No message id'); e.permanent = true; throw e; }

    const ev = await db
      .prepare(`SELECT * FROM reply_events WHERE workspace = ? AND message_id = ?`)
      .bind(ws, messageId).first();
    if (!ev) { const e = new Error('Reply not found'); e.permanent = true; throw e; }

    // Idempotence: a retry after a crash that already stored a label must not
    // buy a second reading of the same sentence.
    if (ev.classification && ev.classification !== REPLY.UNKNOWN) {
      return { reused: true, classification: ev.classification };
    }

    const env = typeof process !== 'undefined' && process.env ? process.env : {};
    const { key, model } = await loadAiKey(db, ws, env);
    const { system, user } = buildClassifyParts({}, {
      subject: ev.subject || '', snippet: ev.snippet || '', fromAddress: ev.from_address || '',
    });
    const { text } = await askBackground(db, {
      workspace: ws, task: 'classify-reply', system, prompt: user,
      maxTokens: 200, apiKey: key, configuredModel: model,
    });

    const cls = parseClassifyResult(text);
    const action = actionFor(cls.classification, { whenIso: cls.whenIso });
    const isReal = action.isRealReply !== false && REAL_REPLY.has(cls.classification);
    const needsHuman = action.needsHuman || NEEDS_HUMAN.has(cls.classification);

    await db
      .prepare(`UPDATE reply_events
                   SET classification = ?, confidence = ?, classified_by = ?, why = ?, requires_human = ?,
                       extracted = ?
                 WHERE workspace = ? AND message_id = ?`)
      .bind(
        cls.classification, cls.confidence, cls.by, cls.why, needsHuman ? 1 : 0,
        cls.extracted ? JSON.stringify({ ...cls.extracted, messageId, at: ev.occurred_at }) : null,
        ws, messageId
      )
      .run();

    if (ev.prospect_id) {
      await applyReplyToProspect(db, ws, ev.prospect_id, {
        cls, action, isReal, needsHuman, occurredAt: ev.occurred_at,
        message: { id: messageId, threadId: ev.thread_id, text: `${ev.subject || ''} ${ev.snippet || ''}` },
      });
    }

    return { classification: cls.classification, confidence: cls.confidence, needsHuman, terminal: true };
  },

  // Writes a follow-up and stops. Nothing here sends anything, and nothing
  // downstream of here does either: the draft lands in Today under "ready for
  // approval" with Ary's finger on the button.
  async [KIND.PREPARE_FOLLOWUP](db, ws, job) {
    const p = await loadProspect(db, job.prospect_id, ws);
    if (!p) { const e = new Error('Prospect not found'); e.permanent = true; throw e; }

    // Re-checked at run time, not trusted from when it was queued. Between the
    // sweep at 4am and this job running, a reply may have landed, and the
    // whole point of the guard is that it is the last word.
    const { results: events } = await db
      .prepare(`SELECT direction, occurred_at, classification FROM reply_events WHERE workspace = ? AND prospect_id = ?`)
      .bind(ws, p.id).all().catch(() => ({ results: [] }));
    const ready = canPrepareFollowUp(p, { events: events?.length ? events : null });
    if (!ready.ok) {
      // Not a failure. The state moved, which is the guard working.
      return { prepared: false, status: ready.status, reason: ready.reason, terminal: true };
    }

    // Which step this is, and whether one is owed at all, from the same policy
    // Today's shadow queue uses. The legacy prompt asked for "a follow-up" with
    // no step and no sight of the first email, so it could not know whether it
    // was writing the second or the last, and could not avoid repeating copy it
    // had never been shown.
    const rel = await db
      .prepare(`SELECT state FROM relationship_events WHERE workspace = ? AND prospect_id = ?
                 ORDER BY occurred_at DESC, id DESC LIMIT 1`)
      .bind(ws, p.id).first().catch(() => null);
    const next = nextFollowupStep({
      prospect: p,
      relationship: rel?.state ? { state: rel.state, deferredUntil: p.deferred_until } : null,
      strong: null,
      evidenceFresh: true,
      contactOk: Boolean(p.email),
    });
    if (!next.step) {
      return { prepared: false, status: 'not-owed', reason: next.why, terminal: true };
    }

    const first = firstEmailOf(p);
    if (!first.body) {
      // Without the first email there is no angle to continue, and inventing
      // one is the failure this whole path exists to prevent.
      return { prepared: false, status: 'no-first-email', reason: 'The first email is not on file, so there is no angle to carry on.', terminal: true };
    }

    const env = typeof process !== 'undefined' && process.env ? process.env : {};
    const { key, model } = await loadAiKey(db, ws, env);
    const settings = await loadEngineSettings(db, ws);
    const { system, user } = buildFollowupParts(settings, p, {
      step: next.step, ceiling: next.ceiling, firstEmail: first,
      evidence: ready.evidence, strength: ready.strength,
    });
    const { text } = await askBackground(db, {
      workspace: ws, task: 'draft', system, prompt: user,
      maxTokens: 400, apiKey: key, configuredModel: model,
    });

    const parsed = parseFollowup(text);
    if (!parsed.ok) throw new Error(parsed.reason);

    // The same deterministic validators the shadow preview runs. A draft that
    // fails them is not written anywhere: a bad draft sitting in Today looking
    // approved is worse than no draft.
    const check = validateFollowup(parsed, {
      prospect: p, step: next.step, ceiling: next.ceiling, firstEmail: first,
      eligible: true, canPersonalise: Boolean(ready.strength?.canPersonalise),
    });
    if (!check.ok) {
      await note(db, ws, p.id, `A follow-up was written and rejected: ${check.problems[0].why} Nothing was saved.`);
      return { prepared: false, status: 'rejected', reason: check.problems[0].why, problems: check.problems, terminal: true };
    }
    const draft = { subject: parsed.subject, body: parsed.body, banned: [] };

    const now = new Date().toISOString();
    await db
      .prepare(`UPDATE prospects SET pending_draft = ?, pending_draft_at = ?, pending_draft_stale = 0, updated_at = ?
                 WHERE id = ? AND workspace = ?`)
      .bind(`Subject: ${draft.subject}\n\n${draft.body}`, now, now, p.id, ws)
      .run();

    const which = next.step >= next.ceiling ? `Email ${next.step}, the last one` : `Email ${next.step}`;
    const base = ready.strength.canPersonalise
      ? `${which} drafted from what was verified about their site. Nothing sent, it needs your approval.`
      : `${which} drafted. Nothing about their site is verified, so it asks rather than tells. Needs your approval.`;
    // Style breaches are said out loud rather than quietly recorded. A draft
    // that ignored her rules should not arrive looking approved.
    await note(db, ws, p.id, draft.banned.length
      ? `${base} Heads up, it used ${draft.banned.join(' and ')}.`
      : base);

    await recordOutcome(db, {
      workspace: ws, prospectId: p.id, kind: OUTCOME.VET, value: 'followup-prepared',
      context: { evidence: ready.strength.level, personalised: ready.strength.canPersonalise, styleFlags: draft.banned },
    });

    return { prepared: true, personalised: ready.strength.canPersonalise, styleFlags: draft.banned, terminal: true };
  },

  // The late-follow-up pilot: one final Email 3 for the two-sent AU and US cohorts.
  //
  // Composes and stops, exactly like PREPARE_FOLLOWUP above. Nothing here
  // sends, schedules a send, or touches an automation switch. The draft lands
  // as an ordinary READY_FOR_APPROVAL package, and a send only ever happens
  // later, through the same guarded path as everything else, after Ary
  // approves the sequence and presses the button herself.
  async [KIND.LATE_FOLLOWUP](db, ws, job) {
    const p = await loadProspect(db, job.prospect_id, ws);
    if (!p) { const e = new Error('Prospect not found'); e.permanent = true; throw e; }

    // The pilot cap, re-read in the last instant rather than trusted from the
    // selector. Two workers racing can each have seen room; the second one to
    // arrive finds the count moved and stops.
    const settings = await loadEngineSettings(db, ws);
    const cap = lateFollowupPilotCap(settings);
    const existing = await pilotDraftCount(db, ws);
    if (existing >= cap) {
      return { composed: false, status: 'pilot-cap-reached', reason: `${existing} pilot drafts exist and the cap is ${cap}.`, terminal: true };
    }

    // One composition per prospect, ever. A pilot package in any status —
    // including one Ary skipped — is a decision already made about this
    // prospect, and remaking it would spend money recreating a thing she
    // declined.
    const prior = await db
      .prepare(`SELECT id, status FROM outreach_packages WHERE workspace = ? AND prospect_id = ? AND generator_version = ? LIMIT 1`)
      .bind(ws, p.id, LATE_FOLLOWUP_GENERATOR_VERSION)
      .first()
      .catch(() => null);
    if (prior) {
      return { composed: false, status: 'already-composed', reason: `Pilot package ${prior.id} already exists (${prior.status}).`, terminal: true };
    }

    // Everything the selector filtered on, asked again of the live row and the
    // full event history. A reply that landed since the enqueue ends this here.
    const { results: eventRows } = await db
      .prepare(
        // Wide enough for everyone downstream: the eligibility check reads the
        // provider ids and addresses, and the conversation fetch decides which
        // threads are really the conversation from matched_by and the
        // threading headers.
        `SELECT direction, occurred_at, classification, message_id, thread_id, to_address, subject,
                matched_by, in_reply_to, refs
           FROM reply_events
          WHERE workspace = ? AND prospect_id = ? AND COALESCE(snippet, '') != 'idempotency marker'
          ORDER BY occurred_at ASC`
      )
      .bind(ws, p.id).all().catch(() => ({ results: [] }));
    const events = eventRows || [];
    const ready = eligibleLateFollowup(p, {
      outbound: events.filter((e) => e.direction === 'outbound'),
      events: events.length ? events : null,
    });
    if (!ready.ok) {
      // Not a failure. The state moved, or the history is not certain enough
      // to write into, and both are the checks doing their job.
      return { composed: false, status: 'not-eligible', reason: ready.reason, terminal: true };
    }
    const [first, second] = ready.outbound;

    // The real emails, whole. The store serves when it has them and syncs from
    // Gmail when it does not; either way the draft is grounded in what was
    // actually sent, never in a 290-character snippet of it.
    const env = typeof process !== 'undefined' && process.env ? process.env : {};
    const convo = await conversationForReading(db, env, { workspace: ws, prospectId: p.id, events });
    const messageOf = (id) => {
      const m = (convo?.messages || []).find((x) => String(x.messageId) === String(id));
      return m && String(m.text || '').trim()
        ? { subject: m.subject || '', body: String(m.text).trim(), at: m.at || null }
        : null;
    };
    const email1 = messageOf(first.message_id);
    const email2 = messageOf(second.message_id);
    if (!email1 || !email2) {
      // Transient on purpose: Gmail being unreachable is a reason to retry,
      // never a reason to compose from less than the whole thread.
      throw new Error('The sent emails could not be read in full from Gmail yet.');
    }

    // The history, written into the canonical send ledger BEFORE anything is
    // composed. These are the mailbox's own facts — real provider message and
    // thread ids, real timestamps, recorded via the reconcile route that
    // exists for exactly this — and they are what makes the send path honest
    // later: the step counts to 3, the schedule anchors on the real first
    // send, and the reply threads into the conversation Email 1 started.
    // recordSend is idempotent on the provider message id, so retries are free.
    for (const [step, ev] of [[1, first], [2, second]]) {
      const r = await recordSend(db, {
        workspace: ws, prospectId: p.id, sequenceStep: step,
        providerMessageId: ev.message_id, providerThreadId: ev.thread_id,
        subject: ev.subject || null, sentAt: ev.occurred_at, via: VIA.RECONCILE,
      });
      if (!r.recorded && !r.duplicate) {
        throw new Error(`Could not record observed email ${step}: ${r.error || 'unknown refusal'}`);
      }
    }

    const { key, model } = await loadAiKey(db, ws, env);
    const parts = buildLateFollowupParts(settings, p, { email1, email2 });
    const { text, model: usedModel } = await askBackground(db, {
      workspace: ws, task: 'draft', system: parts.system, prompt: parts.user,
      maxTokens: 300, apiKey: key, configuredModel: model,
    });

    const parsed = parseLateFollowup(text);
    if (!parsed.ok) throw new Error(parsed.reason);

    const check = validateLateFollowup(parsed.body, { prospect: p, email1 });
    if (!check.ok) {
      // A draft that broke the rules is never saved as sendable copy. The
      // package lands as NEEDS_DECISION carrying only the two sent emails, so
      // a person sees why, the live slot stops a five-minute retry loop, and
      // the sequence cannot be approved: Email 3 does not exist in it, and
      // nothing sends an email that does not exist.
      const fields = lateFollowupPackageFields(p, { email1, email2, draft: '', model: usedModel });
      const id = await savePackage(db, ws, p.id, {
        ...fields,
        status: STATUS.NEEDS_DECISION,
        statusReason: `A final follow-up was drafted and failed validation: ${check.problems[0].why} No sendable copy was saved.`,
        followups: fields.followups.filter((f) => f.step !== LATE_FOLLOWUP_STEP),
      });
      await note(db, ws, p.id, `A final follow-up was drafted and rejected: ${check.problems[0].why} Nothing sendable was saved.`);
      return { composed: false, status: 'rejected', reason: check.problems[0].why, problems: check.problems, packageId: id, terminal: true };
    }

    const id = await savePackage(db, ws, p.id, lateFollowupPackageFields(p, { email1, email2, draft: parsed.body, model: usedModel }));
    await note(db, ws, p.id, 'Email 3 drafted, the final one. It replies into the original Gmail thread and nothing sends without your approval.');
    await recordOutcome(db, {
      workspace: ws, prospectId: p.id, kind: OUTCOME.OUTREACH, value: 'late-followup-prepared',
      context: { packageId: id, step: LATE_FOLLOWUP_STEP, words: check.words },
    });

    return { composed: true, packageId: id, step: LATE_FOLLOWUP_STEP, terminal: true };
  },

  // The whole first-contact package, decided and written in one job.
  //
  // Every decision that could be wrong is made from facts before a word is
  // generated: eligibility, evidence sufficiency, contact, angle. The model
  // writes four sentences about a conclusion it did not reach. If the facts do
  // not support an email, that is a result, and it lands in front of a person
  // rather than becoming a fluent invention.
  async [KIND.PREPARE_OUTREACH](db, ws, job) {
    const p = await loadProspect(db, job.prospect_id, ws);
    if (!p) { const e = new Error('Prospect not found'); e.permanent = true; throw e; }

    // Never overwrite something a person has already looked at.
    //
    // PREPARING is deliberately not on this list. It means a preparation that
    // did not finish — a P2 whose second email could not be written — and it
    // appears on no screen, so nobody has looked at it and there is nothing to
    // protect. Blocking on it made an incomplete package permanent: the retry
    // that exists to finish it would find the stub and stop.
    const existing = await db
      .prepare(`SELECT id, version, status FROM outreach_packages WHERE workspace = ? AND prospect_id = ?
                  AND status IN (${ACTIONABLE_STATUSES.map(() => '?').join(',')}) ORDER BY version DESC LIMIT 1`)
      .bind(ws, p.id, ...ACTIONABLE_STATUSES).first().catch(() => null);
    if (existing) return { reused: true, packageId: existing.id, status: existing.status, terminal: true };

    const { results: events } = await db
      .prepare(`SELECT direction, occurred_at, classification FROM reply_events WHERE workspace = ? AND prospect_id = ?`)
      .bind(ws, p.id).all().catch(() => ({ results: [] }));

    // Pictures of this prospect's pages, and what a model said was in them.
    //
    // Without this the screening has nothing to weigh and every claim about
    // what a visitor sees is rejected — safe, and permanently unable to make a
    // true visual point. `supportsKeys` is what the verdict concluded; the
    // artifact alone never proves anything.
    const { results: shots } = await db
      .prepare(
        `SELECT id, url, normalized_url, viewport, captured_at, blocked, stored_at, vision_json
           FROM visual_artifacts
          WHERE workspace = ? AND prospect_id = ?
          ORDER BY captured_at DESC
          LIMIT 12`
      )
      .bind(ws, p.id).all().catch(() => ({ results: [] }));

    const visualEvidence = (shots || []).map((a) => {
      let looks = [];
      try { looks = JSON.parse(a.vision_json || '[]'); } catch {}
      return {
        tier: a.stored_at ? 'visual' : 'rendered',
        url: a.url,
        normalizedUrl: a.normalized_url,
        viewport: a.viewport,
        capturedAt: a.captured_at,
        blocked: Boolean(a.blocked),
        artifactId: a.id,
        storedAt: a.stored_at || null,
        supportsKeys: looks.filter((l) => l && l.supported).map((l) => l.key),
        unclearKeys: looks
          .filter((l) => l && !l.supported && l.verdict
            && (l.verdict.answer === 'unclear' || l.verdict.confidence === 'low'))
          .map((l) => l.key),
      };
    });

    const settings = await loadEngineSettings(db, ws);
    const plan = planPackage(p, {
      now: new Date(),
      events: events?.length ? events : null,
      prices: { video: PRICES.video },
      // Workspace capability, so a real problem this workspace does not sell a
      // fix for stops here rather than becoming an email.
      settings,
      visualEvidence,
    });

    const write = (status, fields = {}) => savePackage(db, ws, p.id, { status, ...fields });

    // Stopped before anything was generated. Recorded so the reason is visible
    // rather than the prospect simply never appearing.
    if (!plan.ok) {
      const id = await write(plan.status, {
        statusReason: plan.reason,
        evidenceLevel: plan.strength?.level || null,
        evidence: plan.evidence || [],
        playbook: plan.playbook?.id || null,
        generatorVersion: GENERATOR_VERSION,
        playbookVersion: PLAYBOOK_VERSION,
        workspaceFit: plan.fit || null,
        alsoEligible: plan.alsoEligible || null,
      });
      await note(db, ws, p.id, `Outreach not prepared: ${plan.reason}`);
      return { prepared: false, status: plan.status, reason: plan.reason, packageId: id, terminal: true };
    }

    const env = typeof process !== 'undefined' && process.env ? process.env : {};
    const { key, model } = await loadAiKey(db, ws, env);
    const { system, user } = buildEmailParts(settings, p, plan);
    const { text } = await askBackground(db, {
      workspace: ws, task: 'draft', system, prompt: user,
      maxTokens: 800, apiKey: key, configuredModel: model,
    });

    // The generator is allowed to refuse, and refusing is the correct answer
    // more often than manufacturing personalisation is.
    if (String(text).trim().toUpperCase().startsWith(NO_SAFE_ANGLE)) {
      const id = await write(STATUS.NEEDS_DECISION, {
        statusReason: 'The evidence did not support anything specific and true enough to send.',
        playbook: plan.playbook.id,
        whyContact: plan.whyContact,
        evidence: plan.supporting,
        evidenceLevel: plan.strength.level,
        generatorVersion: GENERATOR_VERSION,
        playbookVersion: plan.version?.playbook ?? PLAYBOOK_VERSION,
        model,
        workspaceContextHash: plan.version?.workspaceContext || null,
        evidenceHash: plan.version?.evidence || null,
        selectionReason: plan.selectionReason || null,
        workspaceFit: plan.fit || null,
      });
      await note(db, ws, p.id, 'Outreach stopped: no angle the evidence actually supports.');
      return { prepared: false, status: STATUS.NEEDS_DECISION, reason: 'no safe angle', packageId: id, terminal: true };
    }

    const parsed = parseFollowUp(text);
    if (!parsed.ok) throw new Error(parsed.reason);
    const checked = validateOutreachEmail(parsed, plan, p);

    // Some flags are advice and some are disqualifying.
    //
    // A flag is shown next to the draft and Ary decides. That is right for
    // "this is a bit long" and wrong for a sentence that states something about
    // a stranger's clients which nobody verified: it only stayed out of the
    // inbox because she read it. So the claims that must never reach anybody
    // stop the package instead of annotating it, and the job throws so the
    // queue asks for another draft the same way it retries anything else.
    const disqualifying = checked.flags.filter((f) => /about how their industry behaves|about what happens to other businesses|an outcome the evidence does not support|losing business|statistic nobody can source|unfilled placeholder/i.test(f));
    if (disqualifying.length) {
      const why = `The draft ${disqualifying[0]}, so it was not kept.`;
      await note(db, ws, p.id, `${why} Another will be written.`);
      throw new Error(why);
    }

    const firstBody = ensureSignOff(checked.body, settings);

    // The rest of the sequence, written now rather than after Ary approves.
    //
    // The band decides how many touches this prospect may ever get, and every
    // one of them has to exist before approval, because approving a two-touch
    // sequence has to mean approving two messages somebody read. The send guard
    // already refuses copy that was not in the package at approval, so a
    // sequence approved with Email 2 missing could never send Email 2 anyway:
    // it just failed silently later instead of being complete now.
    //
    // Generated from the first email, so the follow-up can continue it rather
    // than repeat it, and capped at the band's ceiling so P3 stays at one and
    // P2 never reaches three.
    const ceiling = Math.max(1, Number(plan.allowedLength) || 1);
    const followups = [];
    for (let step = 2; step <= ceiling; step += 1) {
      const parts = buildFollowupParts(settings, p, {
        step,
        ceiling,
        firstEmail: { subject: checked.subject, body: firstBody },
        evidence: plan.supporting,
        strength: plan.strength,
      });
      const next = await askBackground(db, {
        workspace: ws, task: 'draft', system: parts.system, prompt: parts.user,
        maxTokens: 800, apiKey: key, configuredModel: model,
      });
      const fp = parseFollowup(next.text);
      // A follow-up that cannot be written is not a reason to lose the first
      // email. The package is saved short, and reconciliation at approval will
      // report the missing step rather than pretending it is there.
      if (!fp.ok) break;
      const vet = validateFollowup(fp, {
        prospect: p, step, ceiling,
        firstEmail: { subject: checked.subject, body: firstBody },
        canPersonalise: Boolean(plan.strength?.canPersonalise),
        // So a follow-up may speak of something breaking only where the
        // finding behind it is an actual breakage.
        evidenceKeys: (plan.supporting || []).map((e) => e.key),
      });
      if (!vet.ok) break;
      followups.push({ step, subject: fp.subject, body: ensureSignOff(fp.body, settings) });
    }

    const spent = await creditsSpentOn(db, ws, p.id);

    // A sequence is complete or it is not ready.
    //
    // Saving it short and letting approval "report the missing step" was not
    // enough: reconciliation returns PARTIAL, which is approvable, so a P2
    // could reach the queue with one email and be approved as two. The number
    // on the approval record is what every later decision reads.
    //
    // So an incomplete preparation never becomes actionable. It is kept, with
    // the email that was already paid for, in PREPARING — on no screen, no
    // decision asked of anybody — and the job throws so the queue retries it
    // the same way it retries anything else. A retry writes a new version with
    // the missing step, because PREPARING no longer blocks preparation.
    const missing = missingSequenceSteps(ceiling, followups);

    const fields = {
      playbook: plan.playbook.id,
      whyContact: plan.whyContact,
      evidence: plan.supporting,
      evidenceLevel: plan.strength.level,
      contactEmail: plan.contact.email,
      contactSource: plan.contact.source,
      emailSubject: checked.subject,
      emailBody: firstBody,
      emailFlags: checked.flags,
      followupPlan: `${plan.playbook.label}. ${plan.playbook.cta || ''}`.trim(),
      followups,
      allowedLength: ceiling,
      priorityBand: plan.band || null,
      bandWasProvisional: plan.bandProvisional ? 1 : 0,
      pdfDecision: plan.pdf.decision,
      pdfReason: plan.pdf.reason,
      videoDecision: plan.video.decision,
      videoReason: plan.video.reason,
      estimatedAssetCredits: plan.estimate?.video?.credits || 0,
      creditsSpent: spent,
      generatorVersion: GENERATOR_VERSION,
      playbookVersion: plan.version.playbook,
      model: modelForTask('draft', model),
      workspaceContextHash: plan.version.workspaceContext,
      evidenceHash: plan.version.evidence,
      selectionReason: plan.selectionReason,
      workspaceFit: plan.fit,
    };

    if (missing.length) {
      const why = `Email ${missing.join(' and ')} could not be written, so the ${plan.band || 'sequence'} package is not complete.`;
      await write(STATUS.PREPARING, { ...fields, statusReason: why });
      await note(db, ws, p.id, `${why} It will be tried again.`);
      throw new Error(why);
    }
    const id = await write(STATUS.READY, fields);

    await note(db, ws, p.id, `Outreach package ready for approval. Angle: ${plan.playbook.label}.${checked.flags.length ? ` Heads up, the draft ${checked.flags[0]}.` : ''}`);
    await recordOutcome(db, {
      workspace: ws, prospectId: p.id, kind: OUTCOME.VET, value: 'outreach-prepared',
      context: { playbook: plan.playbook.id, evidence: plan.strength.level, pdf: plan.pdf.decision, video: plan.video.decision, flags: checked.flags },
    });

    return {
      prepared: true, packageId: id, playbook: plan.playbook.id,
      pdf: plan.pdf.decision, video: plan.video.decision,
      flags: checked.flags, terminal: true,
    };
  },

  // The sweep. Finds work and enqueues it; does no expensive work itself.
  // This is what the daily-followup-sweep skill decides by hand every run.
  async [KIND.SWEEP](db, ws) {
    const { results } = await db
      .prepare(
        `SELECT ${PROSPECT_COLUMNS} FROM prospects
          WHERE workspace = ? AND deleted_at IS NULL
            AND stage NOT IN ('Client','Rejected','Not This Offer','Lost','Invalid Email','Finished')
          ORDER BY next_action_date IS NULL, next_action_date ASC
          LIMIT 500`
      )
      .bind(ws)
      .all();
    const rows = results || [];
    const now = new Date();
    // Longest-waiting first, so the small daily draft budget goes to whoever
    // has been overdue longest rather than to whichever rows the database
    // happened to hand back first.
    const limits = await loadAutoLimits(db, ws);

    let paused = 0;
    let reconsider = 0;
    const draftable = [];
    const surfaced = [];

    // The real messages, loaded once for the batch.
    //
    // The guard has always accepted these and the sweep has never passed them,
    // which was fine only while `replied` was the whole story. It is not: a
    // reply the classifier could not read stays `replied = 0` on purpose, so
    // that unreadable mail never inflates a reply rate. Without the events the
    // guard therefore saw nothing, said `ok`, and would have prepared a
    // follow-up to somebody who had just written in.
    //
    // Caught by a live test on 2026-08-09: a real inbound arrived, the draft
    // was correctly staled, and the sweep would still have written a new one.
    // The case we cannot read is the case to be most careful with.
    const { results: replyRows } = await db
      .prepare(
        `SELECT prospect_id, direction, occurred_at, classification
           FROM reply_events
          WHERE workspace = ? AND prospect_id IS NOT NULL
          ORDER BY occurred_at DESC LIMIT 2000`
      )
      .bind(ws).all().catch(() => ({ results: [] }));
    const eventsByProspect = new Map();
    for (const r of replyRows || []) {
      const list = eventsByProspect.get(r.prospect_id) || [];
      list.push(r);
      eventsByProspect.set(r.prospect_id, list);
    }
    const eventsFor = (id) => {
      const e = eventsByProspect.get(id);
      return e && e.length ? e : null;
    };

    for (const p of rows) {
      // The pre-send guard, applied to every active row every sweep. A reply
      // that arrived overnight stops the cadence before anything is prepared,
      // rather than after something has gone out.
      const gate = canProgressOutbound(p, { now, events: eventsFor(p.id) });
      if (!gate.ok && gate.surface) {
        surfaced.push({ id: p.id, stop: gate.stop, reason: gate.reason });
        if (gate.stop === STOP.UNANSWERED_REPLY) {
          paused += 1;
          // Recorded once, not every sweep: the note is checked first.
          const already = String(p.activity_log || '').includes('Follow-up paused: they replied');
          if (!already) await note(db, ws, p.id, 'Follow-up paused: they replied and nothing has gone back yet.');
        }
      }

      // Due and clean. Collected rather than queued here: which ten of the
      // eighty-seven get written is a ranking question, and answering it in
      // row order would hand the day's drafts to whoever the database
      // returned first.
      if (gate.ok && limits.autoVet) {
        const ready = canPrepareFollowUp(p, { now, events: eventsFor(p.id) });
        if (ready.ok) draftable.push(p);
      }

      // A deferred prospect whose date arrived. Reconsidering means looking
      // again, never resending the old email.
      if (isReadyToReconsider(p, { now })) {
        const r = await enqueue(db, { workspace: ws, kind: KIND.VET, prospectId: p.id, priority: PRIORITY.VET, extra: 'reconsider' });
        if (r.queued) {
          reconsider += 1;
          await note(db, ws, p.id, 'Deferred window opened. Looking at them again rather than resending.');
        }
      }
    }

    // Before writing a single follow-up: is what we know about replies still
    // true? A mailbox that has been broken since Tuesday means the guard is
    // clearing prospects who wrote back on Tuesday. Preparing drafts on that
    // basis is how the worst email in the sequence gets written.
    const health = mailboxHealth(await listAccounts(db, ws), { now });

    // Which of the due prospects get today's small draft budget.
    //
    // Eighty-seven are due on an ordinary day and ten get written, so the
    // ordering is the feature. Pick Bee already answers "who deserves
    // attention", using reply history, warmth, Ary's own rating, verified
    // evidence, engagement and how long they have waited. Reusing it means the
    // drafts go to the same people the app would have told her to look at, and
    // no second definition of "important" exists to drift from the first.
    //
    // No model involved. The ranking is code; the model only writes sentences.
    // How much is already waiting to be read.
    //
    // The system must not spend money producing a hundred packages a day when
    // the person reviewing them clears eight. A package sitting unread for a
    // week is worse than one never written: the evidence behind it goes stale,
    // and it gets approved on the strength of research that stopped describing
    // the site days ago.
    const waitingRow = await db
      .prepare(`SELECT COUNT(*) n FROM outreach_packages WHERE workspace = ? AND status = 'READY_FOR_APPROVAL'`)
      .bind(ws).first().catch(() => ({ n: 0 }));
    const backpressure = preparationAllowance({
      readyForApproval: Number(waitingRow?.n) || 0,
      dailyDraftCap: Number(limits?.maxDraftsPerDay) || 0,
    });

    const drafting = health.safeToPrepare && backpressure.drafts > 0
      ? await queueDrafts(db, ws, draftable, { limits: { ...limits, maxDraftsPerDay: backpressure.drafts }, now })
      : 0;

    // Research. Without this the queue only ever holds what somebody clicked,
    // and "automatic research is on" means a budget guarding an empty queue.
    //
    // Prescreen is never throttled by backpressure: it is free, and it is the
    // step that stops money being spent on the wrong prospect. Only the paid
    // research pauses when the review queue is full.
    const researching = backpressure.research
      ? await feedResearch(db, ws, { limits })
      : { queued: 0, held: backpressure.reason };

    // The other half of automation: bringing an already-approved, explicitly
    // armed, genuinely due follow-up to a worker.
    //
    // Last, and cheapest. With the global switch off it reads the switch, finds
    // it off, and stops — no package query, no prospect join, nothing.
    const autoFollowups = await enqueueDueApprovedFollowups(db, ws, { now, mailboxOk: health.safeToPrepare });

    await recordOutcome(db, { workspace: ws, kind: OUTCOME.VET, value: 'sweep', context: { scanned: rows.length, paused, reconsider, drafting, researching: researching.queued, waiting: Number(waitingRow?.n) || 0, autoFollowupsQueued: autoFollowups.queued } });
    return {
      scanned: rows.length, pausedForReply: paused, reconsidering: reconsider,
      drafting, surfaced: surfaced.length, research: researching,
      autoFollowups,
      backpressure: backpressure.reason ? backpressure : undefined,
      // Said out loud in the job result. A sweep that quietly prepared nothing
      // is indistinguishable from a sweep with nothing to prepare.
      mailbox: health.state,
      ...(health.safeToPrepare ? {} : { draftingHeldBecause: health.reason }),
    };
  },
};

// The statuses idx_pkg_live counts as live. Kept beside the write path that
// has to respect them, and deliberately spelled out rather than derived from
// ACTIONABLE_STATUSES: that list is about what a person may act on, and
// PREPARING is on this one and not on that one.
const LIVE_STATUSES = [STATUS.PREPARING, STATUS.READY, STATUS.NEEDS_DECISION, STATUS.APPROVED];

// The columns a package is written with, in one place, so the insert and the
// resume below cannot drift into writing different shapes of the same package.
const PACKAGE_COLUMNS = [
  'status', 'status_reason', 'playbook', 'why_contact',
  'evidence', 'evidence_level', 'contact_email', 'contact_source', 'email_subject', 'email_body',
  'email_flags', 'followup_plan', 'pdf_decision', 'pdf_reason', 'video_decision', 'video_reason',
  'estimated_asset_credits', 'credits_spent',
  'generator_version', 'playbook_version', 'model', 'workspace_context_hash',
  'evidence_hash', 'also_eligible', 'selection_reason', 'workspace_fit',
  'followups', 'allowed_length', 'priority_band', 'band_was_provisional',
];

const packageValues = (f = {}) => [
  f.status, f.statusReason || null, f.playbook || null, f.whyContact || null,
  f.evidence ? JSON.stringify(f.evidence).slice(0, 4000) : null, f.evidenceLevel || null,
  f.contactEmail || null, f.contactSource || null, f.emailSubject || null, f.emailBody || null,
  f.emailFlags ? JSON.stringify(f.emailFlags) : null, f.followupPlan || null,
  f.pdfDecision || null, f.pdfReason || null, f.videoDecision || null, f.videoReason || null,
  Number(f.estimatedAssetCredits) || 0, Number(f.creditsSpent) || 0,
  f.generatorVersion || null, f.playbookVersion || null, f.model || null,
  f.workspaceContextHash || null, f.evidenceHash || null,
  f.alsoEligible ? JSON.stringify(f.alsoEligible) : null, f.selectionReason || null, f.workspaceFit || null,
  // Null rather than an empty array when there are none, so a package that
  // never had follow-ups reads the same as it always did.
  f.followups?.length ? JSON.stringify(f.followups) : null,
  Number.isFinite(Number(f.allowedLength)) ? Number(f.allowedLength) : null,
  f.priorityBand || null, Number(f.bandWasProvisional) ? 1 : 0,
];

// Writes one version of a package. Never updates a reviewed one: a new
// version is created deliberately, so the record of what somebody actually
// saw and agreed to survives.
//
// With one exception, and it is the reason this function was changed. A P2
// preparation can fail after Email 1 and before Email 2 — the writer produced
// a second email the claim rules refused — and the handler stores the partial
// result as PREPARING and throws so the queue retries.
//
// That retry used to collide with itself. `idx_pkg_live` is a UNIQUE index on
// (workspace, prospect_id) across PREPARING, READY_FOR_APPROVAL, NEEDS_DECISION
// and APPROVED, so only one live package may exist per prospect; this function
// only ever INSERTed. The handler deliberately does not treat PREPARING as a
// reason to stop, precisely so the retry can finish the job — and then the
// write it came back to do was refused by the database. Prospect 3163 hit it
// for real: attempt 2 left package 22 in PREPARING, attempt 3 died on
// `UNIQUE constraint failed`, and clearing the row by hand was the only way
// forward. A half-written package blocked its own repair.
//
// So a live PREPARING row is resumed rather than duplicated. Ownership needs no
// new column: `idx_pkg_live` already guarantees at most one live package per
// prospect, so "the PREPARING row for this prospect" is unambiguous by
// construction. Same id, same version, no gap.
// Exported so the retry contract can be tested against a real database with
// the real index, rather than described. It is the same function the
// preparation handler calls.
export async function savePackage(db, ws, prospectId, f = {}) {
  const now = new Date().toISOString();

  // Whatever occupies the one live slot, if anything. Asked as one question
  // rather than "is there a PREPARING row", because the answer decides between
  // three different behaviours and the middle one used to be missing: a live
  // package that is NOT ours to resume still blocks an insert, and falling
  // through to one produced a raw `UNIQUE constraint failed` instead of a
  // decision.
  const live = await db
    .prepare(`SELECT id, version, status FROM outreach_packages
               WHERE workspace = ? AND prospect_id = ?
                 AND status IN (${LIVE_STATUSES.map(() => '?').join(',')}) LIMIT 1`)
    .bind(ws, prospectId, ...LIVE_STATUSES).first().catch(() => null);

  // Reviewed, approved, or waiting for a person. Never overwritten and never
  // duplicated: an explicit reprepare retires it first, which frees the slot.
  if (live && live.status !== STATUS.PREPARING) return live.id;

  const open = live;
  if (open) {
    // Every column, not the changed ones. A package must never end up holding
    // Email 1 from one attempt and Email 2 from another: the two were written
    // against whatever the rules were at the time, and a row stitched from both
    // is a package nobody generated.
    //
    // Conditional on the status it was read at, so a worker whose lease expired
    // cannot write over a package that has since been approved or sent. If the
    // row moved on, this matches nothing and writes nothing.
    // A no-op when the row has moved on, which is the point: the answer is
    // still this package. Inserting instead would put a second live package
    // behind whoever finished it.
    await db
      .prepare(
        `UPDATE outreach_packages
            SET ${PACKAGE_COLUMNS.map((c) => `${c} = ?`).join(', ')}, updated_at = ?
          WHERE id = ? AND workspace = ? AND status = '${STATUS.PREPARING}'`
      )
      .bind(...packageValues(f), now, open.id, ws)
      .run();

    return open.id;
  }

  const { results } = await db
    .prepare(`SELECT MAX(version) AS v FROM outreach_packages WHERE workspace = ? AND prospect_id = ?`)
    .bind(ws, prospectId).all().catch(() => ({ results: [] }));
  const version = (Number(results?.[0]?.v) || 0) + 1;
  const res = await db.prepare(
    `INSERT INTO outreach_packages
       (workspace, prospect_id, version, status, status_reason, playbook, why_contact,
        evidence, evidence_level, contact_email, contact_source, email_subject, email_body,
        email_flags, followup_plan, pdf_decision, pdf_reason, video_decision, video_reason,
        estimated_asset_credits, credits_spent, created_at, updated_at,
        generator_version, playbook_version, model, workspace_context_hash,
        evidence_hash, also_eligible, selection_reason, workspace_fit,
        followups, allowed_length, priority_band, band_was_provisional)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    ws, prospectId, version, f.status, f.statusReason || null, f.playbook || null, f.whyContact || null,
    f.evidence ? JSON.stringify(f.evidence).slice(0, 4000) : null, f.evidenceLevel || null,
    f.contactEmail || null, f.contactSource || null, f.emailSubject || null, f.emailBody || null,
    f.emailFlags ? JSON.stringify(f.emailFlags) : null, f.followupPlan || null,
    f.pdfDecision || null, f.pdfReason || null, f.videoDecision || null, f.videoReason || null,
    Number(f.estimatedAssetCredits) || 0, Number(f.creditsSpent) || 0, now, now,
    f.generatorVersion || null, f.playbookVersion || null, f.model || null,
    f.workspaceContextHash || null, f.evidenceHash || null,
    f.alsoEligible ? JSON.stringify(f.alsoEligible) : null, f.selectionReason || null, f.workspaceFit || null,
    // Null rather than an empty array when there are none, so a package that
    // never had follow-ups reads the same as it always did.
    f.followups?.length ? JSON.stringify(f.followups) : null,
    Number.isFinite(Number(f.allowedLength)) ? Number(f.allowedLength) : null,
    f.priorityBand || null, Number(f.bandWasProvisional) ? 1 : 0
  ).run().catch(async (err) => {
    // Two workers both found the slot empty and both wrote. The index is the
    // last word and one of them lost; the loser's answer is the package that
    // won, not a crash.
    if (!/UNIQUE|constraint/i.test(String(err?.message || ''))) throw err;
    const won = await db
      .prepare(`SELECT id FROM outreach_packages
                 WHERE workspace = ? AND prospect_id = ?
                   AND status IN (${LIVE_STATUSES.map(() => '?').join(',')}) LIMIT 1`)
      .bind(ws, prospectId, ...LIVE_STATUSES).first().catch(() => null);
    if (won) return { meta: { last_row_id: won.id } };
    throw err;
  });
  return res?.meta?.last_row_id ?? null;
}

// What this prospect has cost so far, from the ledgers rather than guessed.
async function creditsSpentOn(db, ws, prospectId) {
  const row = await db.prepare(
    `SELECT COALESCE(SUM(credits), 0) AS n FROM ai_usage WHERE workspace = ? AND prospect_id = ?`
  ).bind(ws, prospectId).first().catch(() => null);
  const probe = await db.prepare(
    `SELECT site_intel_source FROM prospects WHERE id = ? AND workspace = ?`
  ).bind(prospectId, ws).first().catch(() => null);
  // A probe that actually ran is the one large, certain cost on most rows.
  return (Number(row?.n) || 0) + (probe?.site_intel_source === 'auto' ? PRICES.precheck : 0);
}

// Ranks the due prospects and queues drafts for the best few.
//
// Ordering is entirely deterministic: Pick Bee's band first (a reply beats a
// watched video beats a warm due date beats a cold one), then how long they
// have been waiting inside that band. Ties break on Ary's own rating, because
// when the machine cannot separate two prospects her opinion should.
export async function queueDrafts(db, ws, candidates = [], { limits, now = new Date() } = {}) {
  const cap = Math.max(0, Number(limits?.maxDraftsPerDay) || 0);
  if (!cap || !candidates.length) return 0;

  const ranked = candidates
    .map((p) => ({ p, r: rankOne(p, { now }) }))
    .filter((x) => x.r)
    .sort((a, b) => {
      if (b.r.band !== a.r.band) return b.r.band - a.r.band;
      if ((b.r.waiting || 0) !== (a.r.waiting || 0)) return (b.r.waiting || 0) - (a.r.waiting || 0);
      return (Number(b.p.rating) || 0) - (Number(a.p.rating) || 0);
    });

  let queued = 0;
  for (const { p } of ranked) {
    if (queued >= cap) break;
    const r = await enqueue(db, {
      workspace: ws, kind: KIND.PREPARE_FOLLOWUP, prospectId: p.id, priority: PRIORITY.PREPARE_FOLLOWUP,
    });
    if (r.queued) queued += 1;
  }
  return queued;
}

// Brings due, explicitly armed P2 follow-ups to the queue.
//
// The narrowest thing that closes the gap. It does not decide whether an email
// may be sent — it decides whether the question is worth asking a worker. The
// answer is asked again, in full, in the last instant before Gmail.
//
// Cheap by construction. The workspace switch is read first, and with it off
// this returns before touching a package row, which is what makes it safe to
// run on every sweep for ever while automation stays off.
export async function enqueueDueApprovedFollowups(db, ws, { now = new Date(), mailboxOk = true } = {}) {
  const policy = sendPolicy(await loadEngineSettings(db, ws));
  if (!policy.autoSendApprovedFollowups) {
    return { queued: 0, considered: 0, reason: SKIP.AUTOMATION_OFF };
  }

  // Only packages somebody explicitly armed. The index on
  // (workspace, auto_followup_approved, status) makes this the cheap query it
  // looks like, and with nothing armed it returns no rows at all.
  const { results: armed } = await db
    .prepare(
      `SELECT * FROM outreach_packages
        WHERE workspace = ? AND auto_followup_approved = 1
          AND status IN ('APPROVED','SENT')
        ORDER BY id LIMIT 50`
    )
    .bind(ws).all().catch(() => ({ results: [] }));

  const out = { queued: 0, considered: (armed || []).length, skipped: {} };
  const skip = (why) => { out.skipped[why] = (out.skipped[why] || 0) + 1; };

  for (const pkg of armed || []) {
    const prospect = await db
      .prepare(`SELECT ${PROSPECT_COLUMNS} FROM prospects WHERE id = ? AND workspace = ? AND deleted_at IS NULL`)
      .bind(pkg.prospect_id, ws).first().catch(() => null);
    if (!prospect) { skip(SKIP.NOT_PILOT_SHAPE); continue; }

    const { results: sends } = await db
      .prepare(
        `SELECT sequence_step, sent_at, provider_thread_id FROM send_events
          WHERE workspace = ? AND prospect_id = ? ORDER BY sent_at ASC`
      )
      .bind(ws, pkg.prospect_id).all().catch(() => ({ results: [] }));

    const { results: events } = await db
      .prepare(
        `SELECT direction, occurred_at, classification FROM reply_events
          WHERE workspace = ? AND prospect_id = ?`
      )
      .bind(ws, pkg.prospect_id).all().catch(() => ({ results: [] }));

    // The thread Email 1 really created. Read from the send history rather
    // than assumed, because a follow-up with no thread starts a second
    // conversation instead of continuing one.
    const threadId = (sends || []).find((s) => Number(s.sequence_step) === 1)?.provider_thread_id || null;

    const candidate = autoFollowupCandidate({
      pkg, prospect, sends: sends || [], events: events?.length ? events : null,
      policy, threadId, mailboxOk, now,
    });
    if (!candidate.ok) { skip(candidate.skip); continue; }

    const job = sendJobFor(pkg, candidate);
    const r = await enqueue(db, {
      workspace: ws, kind: KIND.SEND_APPROVED, prospectId: job.prospectId,
      priority: PRIORITY.SEND_APPROVED ?? PRIORITY.VET,
      extra: job.extra, runAfter: job.runAfter, payload: job.payload,
    });
    if (!r.queued) { skip('already-queued'); continue; }

    out.queued += 1;
    // Why this one, and what was true when it was chosen. Identifiers and
    // decisions only: no subject, no body, no token.
    await recordOutcome(db, {
      workspace: ws, prospectId: pkg.prospect_id, kind: OUTCOME.OUTREACH,
      value: 'auto-followup-queued',
      context: {
        packageId: pkg.id, step: candidate.step, jobId: r.id,
        dueAt: candidate.dueAt, runAfter: candidate.runAfter,
        insideWindowNow: candidate.insideWindowNow,
        packagePermission: true, globalAutomation: true,
      },
    });
    await note(db, ws, pkg.prospect_id, `Email ${candidate.step} queued to send automatically. Every safety check runs again before it goes.`);
  }

  return out;
}

// Picks prospects with no evidence and starts the pipeline on them.
//
// The size of the batch is decided by money, not by a round number. Feeding
// more than today's allowance can pay for does not research more prospects, it
// builds a permanent backlog of jobs waiting on budget that grows every day and
// never drains. Under-feeding costs nothing: tomorrow's sweep picks up where
// this one stopped.
//
// Ordering is Ary's own rating first, then whoever she is already writing to.
//
// Rating alone was not enough. Almost nothing in a 5,000-row import is rated,
// so the tiebreak decided everything, and `id DESC` sent the first day's eight
// probes to the newest raw imports: no name, no contact, and two of them 404s.
// Researching somebody before anybody has decided to contact them is the
// speculative end of the list, not the useful end.
//
// So: her rating, then how far into the sequence they already are, then
// whether there is an address to write to. Evidence about somebody being
// emailed this week pays off this week.
export async function feedResearch(db, ws, { limits = null } = {}) {
  const l = limits || (await loadAutoLimits(db, ws));
  if (!l.autoVet) return { queued: 0, reason: 'Automatic research is switched off.' };

  const unit = estimateCost('precheck');
  const spent = await autoSpentToday(db, ws);
  const { balance } = await loadCredits(db, ws);

  const byDay = Math.floor(Math.max(0, l.autoCreditsPerDay - spent) / unit);
  const byBalance = Math.floor(Math.max(0, balance - l.reserveCredits) / unit);
  const take = Math.min(l.maxProspectsPerRun, byDay, byBalance);
  if (take <= 0) {
    const reason = byBalance <= 0
      ? `Balance is at the ${l.reserveCredits.toLocaleString()} credit reserve, so background research is holding off.`
      : `Today's automatic allowance is spent. It resets tomorrow.`;
    return { queued: 0, reason, affordable: 0 };
  }

  const { results } = await db
    .prepare(
      `SELECT id FROM prospects
        WHERE workspace = ? AND deleted_at IS NULL
          AND stage NOT IN ('Client','Rejected','Not This Offer','Lost','Invalid Email','Finished')
          AND do_not_contact = 0 AND unsubscribed = 0
          AND site_intel IS NULL
          AND (own_findings IS NULL OR own_findings = '')
          AND domain IS NOT NULL AND domain != ''
        ORDER BY COALESCE(rating, 0) DESC,
                 COALESCE(emails_sent, 0) DESC,
                 (email IS NOT NULL AND email != '') DESC,
                 id DESC
        LIMIT ?`
    )
    .bind(ws, take)
    .all();

  let queued = 0;
  for (const r of results || []) {
    const res = await enqueue(db, { workspace: ws, kind: KIND.PRESCREEN, prospectId: r.id, priority: PRIORITY.PRESCREEN });
    if (res.queued) queued += 1;
  }
  return { queued, affordable: take, candidates: (results || []).length };
}

// Runs up to `max` jobs. Shared by the cron path and the manual drain.
//
// `kinds` and `excludeKinds` are what make lanes possible: the general drain
// excludes scanner work, and the scanner lane below asks for nothing else.
export async function runJobs(db, workspace, { max = 5, kinds = null, excludeKinds = null } = {}) {
  const ran = [];
  for (let i = 0; i < max; i += 1) {
    const job = await claimNext(db, { workspace, kinds, excludeKinds });
    if (!job) break;
    const handler = HANDLERS[job.kind];
    if (!handler) {
      await fail(db, job, { error: `No handler for ${job.kind}`, kind: ERROR_KIND.PERMANENT });
      ran.push({ id: job.id, kind: job.kind, status: 'failed', error: 'no handler' });
      continue;
    }
    try {
      const result = await handler(db, workspace, job);
      await complete(db, job.id, { result, job });
      ran.push({ id: job.id, kind: job.kind, prospectId: job.prospect_id, status: 'done', ...result });
    } catch (err) {
      const kind = classifyError(err);
      const out = await fail(db, job, { error: err, kind });
      ran.push({
        id: job.id, kind: job.kind, prospectId: job.prospect_id,
        status: out.status, errorKind: kind,
        error: String(err?.message || err).slice(0, 200),
      });
    }
  }
  return { ran, summary: await queueSummary(db, workspace) };
}

// ── The scanner lane ─────────────────────────────────────────────────────
//
// Site checks take about thirty seconds each. The general drain gives itself
// twenty-five seconds for everything, checked between jobs, so the first
// scanner item of a drain always overran it and the invocation ended having
// done exactly one. Five-minute cron, one item: twelve an hour, which is what
// production measured.
//
// The fix is not a bigger global budget. That would speed up sending too, and
// sending is the one thing that must not change. So scanner work gets its own
// lane with its own bound, and the general lane no longer sees it at all.
//
// Bounded on three axes at once, because each one alone fails differently:
// how many at a time (the render service can only serve so many), how long in
// total (an invocation that overruns is killed holding claimed jobs), and
// whether to start another wave at all (a wave begun with no room finishes
// past the end).
export async function runScannerLane(db, {
  concurrency = SCANNER_CONCURRENCY,
  budgetMs = SCANNER_BUDGET_MS,
  reserveMs = SCANNER_WAVE_RESERVE_MS,
  startedAt = Date.now(),
  clock = () => Date.now(),
  // Injectable so the bound can actually be tested. Whether two things really
  // run at once, and whether a third really waits, cannot be observed from
  // outside without standing where the work happens; the alternative is a test
  // that makes real network calls to a paid service to find out.
  handler = HANDLERS[KIND.SCANNER_ITEM],
} = {}) {
  const ran = [];
  let waves = 0;
  let stoppedBecause = 'no work';

  for (;;) {
    const elapsed = clock() - startedAt;
    if (elapsed > budgetMs - reserveMs) { stoppedBecause = 'time budget'; break; }

    // How many are already out, across every worker.
    //
    // Bounding the loop is not the same as bounding the resource, and the
    // difference showed up the first time this ran for real: two drain
    // invocations overlapped by two seconds, each obeyed its own limit of two,
    // and three site checks ran at once. Nothing broke, because three is
    // exactly what the render service can serve, but the margin that was
    // supposed to keep an instance free for Ary's video renders was gone.
    //
    // So the count comes from the queue, which every worker shares, rather than
    // from this function's own arithmetic. Stale claims are excluded on the
    // same rule the claim expiry uses, or a worker that died would hold a slot
    // for ever.
    const inFlight = await scannerInFlight(db);
    const room = concurrency - inFlight;
    if (room <= 0) { stoppedBecause = 'another worker has the lane'; break; }

    // Claim sequentially. Claiming is a conditional UPDATE, so two workers
    // racing for the same row cannot both win; doing it one at a time also
    // means a partly-filled wave is a real wave rather than an error.
    const batch = [];
    for (let i = 0; i < room; i += 1) {
      const job = await claimNext(db, { kinds: [KIND.SCANNER_ITEM] });
      if (!job) break;

      // Look again, now that this claim is visible to everybody. Two workers
      // can still read the same headroom a moment apart; what they cannot do is
      // both hold a claim without seeing it. Whoever notices the overshoot puts
      // its job back rather than running it, which costs a drain's delay and
      // never costs a double render.
      if (await scannerInFlight(db) > concurrency) {
        await release(db, job);
        break;
      }
      batch.push(job);
    }
    if (!batch.length) { stoppedBecause = waves ? 'no work left' : 'no work'; break; }

    waves += 1;

    // Now run them together. allSettled, not all: one site that will not load
    // must not take its siblings down with it, and each item has already
    // written its own outcome by the time we get here.
    const results = await Promise.allSettled(
      batch.map(async (job) => {
        const began = clock();
        try {
          const result = await handler(db, job.workspace, job);
          await complete(db, job.id, { result, job });
          return { id: job.id, prospectId: job.prospect_id, status: 'done', ms: clock() - began, ...result };
        } catch (err) {
          const kind = classifyError(err);
          const out = await fail(db, job, { error: err, kind });
          return {
            id: job.id, prospectId: job.prospect_id, status: out.status, errorKind: kind,
            ms: clock() - began, error: String(err?.message || err).slice(0, 200),
          };
        }
      })
    );

    for (const r of results) {
      // `fail` itself throwing is the only way to land here, and it is still
      // not a reason to abandon the rest of the drain.
      ran.push(r.status === 'fulfilled' ? r.value : { status: 'failed', error: 'worker crashed' });
    }
  }

  return { ran, waves, stoppedBecause };
}
