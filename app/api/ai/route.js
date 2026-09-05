import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { loadLimits, bumpAiCalls, readAiCalls } from '@/lib/limits.mjs';
import { spendCredits, refundCredits, priceOf, OUT_OF_CREDITS } from '@/lib/credits.mjs';
import { modelForTask, recordUsage } from '@/lib/ai-cost.mjs';
import { openSecret } from '@/lib/secret-box.mjs';
import { getCloudflareContext } from '@opennextjs/cloudflare';

function secretEnv() {
  try {
    const { env } = getCloudflareContext();
    if (env) return env;
  } catch {}
  return typeof process !== 'undefined' && process.env ? process.env : {};
}
import {
  DEFAULT_ENGINE_SETTINGS,
  buildVerdictParts,
  statusForVerdict,
  isHumanDecided,
  buildMessageWriterParts,
  buildBuyerFinderPrompt,
  parseScoringResult,
} from '@/lib/engine-prompts.mjs';
import { buildProspectContext } from '@/lib/prospect-context.mjs';
import {
  buildReplyCoachParts,
  buildCallPrepParts,
  buildProposalParts,
  buildBestFiveParts,
  buildObjectionParts,
  buildVoiceNoteParts,
  buildContentScriptsParts,
  VOICE_NOTE_ALLOWED_STAGES,
} from '@/lib/bee-prompts.mjs';
import { videoSeen } from '@/lib/watch-url.mjs';
import { rankProspects, renderPicks, picksForPrompt } from '@/lib/pick.mjs';
// tz.mjs has never exported todayIso; it exports tzToday. The import resolved
// to undefined, so both Pick Bee and the voice note threw "todayIso is not a
// function" the moment they were used. The build said so in a warning nobody
// was reading.
import { tzToday } from '@/lib/tz.mjs';

// Force-dynamic: this route reads per-request state from D1 and must never be prerendered.
export const dynamic = 'force-dynamic';

// The hive's shared transport. The engine's prompt builders stay the
// single source of truth — this route only moves text to the user's own
// AI (their key, their cost) and applies the result to the database.
// Tasks: score (one lead), draft (one lead), phrases (refresh intent
// phrases), analyze (pipeline report from live data).

async function loadEngineSettings(db, workspace) {
  const row = await db.prepare(`SELECT value FROM settings WHERE workspace = ? AND key = ?`).bind(workspace, 'engine').first();
  let stored = {};
  if (row && row.value) {
    try { stored = JSON.parse(row.value); } catch { stored = {}; }
  }
  return { ...DEFAULT_ENGINE_SETTINGS, ...stored };
}

// Budgets are generous on purpose: extended-thinking models (claude-sonnet-5
// and friends) spend part of max_tokens on invisible thinking BEFORE any
// visible text. A tight budget on a big prompt (e.g. a 270-row pipeline)
// gets eaten entirely by thinking and the reply comes back with zero text
// blocks — that was the "AI returned an empty response" bug. You only pay
// for tokens actually used, so a high ceiling costs nothing extra.
// `system` is optional: when set, the stable part of the prompt (rubric,
// workspace rules, voice samples) goes out as a system block with a prompt
// cache marker.
//
// That marker is currently doing nothing, and the comment here used to claim
// otherwise. Anthropic silently skips caching for prefixes below about 1024
// tokens; this app's largest system prefix, measured, is 706. So no call has
// ever produced a cache hit. The marker stays because it is correct and free
// if the prompts ever grow past the floor, but nothing should be assumed to be
// saved by it: /api/ai-usage reports cache_read tokens, and while that reads
// zero, caching is off. See AI-COST-MODEL.md. The real lever at these prompt
// sizes is output, which bills at 5x input.
//
// OpenAI keys get it as a plain system message.
async function callAI({ apiKey, model, prompt, system = null, maxTokens = 4000 }) {
  const isAnthropic = apiKey.startsWith('sk-ant-');
  const url = isAnthropic ? 'https://api.anthropic.com/v1/messages' : 'https://api.openai.com/v1/chat/completions';
  const headers = isAnthropic
    ? { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
    : { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };

  async function attempt(budget) {
    const body = isAnthropic
      ? {
          model,
          max_tokens: budget,
          ...(system
            ? { system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] }
            : {}),
          messages: [{ role: 'user', content: prompt }],
        }
      : {
          model,
          max_tokens: budget,
          messages: [
            ...(system ? [{ role: 'system', content: system }] : []),
            { role: 'user', content: prompt },
          ],
        };
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = data?.error?.message || `HTTP ${res.status}`;
      throw new Error(detail);
    }
    // Anthropic returns an array of content blocks. With extended-thinking
    // models the first block is a `thinking` block (no `.text`), so pull the
    // text from every `text` block, not just content[0].
    const text = isAnthropic
      ? (Array.isArray(data?.content) ? data.content : [])
          .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
          .map((b) => b.text)
          .join('\n')
          .trim()
      : data?.choices?.[0]?.message?.content;
    const stopReason = isAnthropic ? data?.stop_reason : data?.choices?.[0]?.finish_reason;
    // The usage block was read off every response and dropped. It is the only
    // record of what a run actually cost, and without it every credit price in
    // the app was a guess nobody could check. OpenAI names the same numbers
    // differently, so both shapes are normalised to Anthropic's.
    const usage = isAnthropic
      ? (data?.usage || {})
      : {
          input_tokens: data?.usage?.prompt_tokens || 0,
          output_tokens: data?.usage?.completion_tokens || 0,
          cache_read_input_tokens: data?.usage?.prompt_tokens_details?.cached_tokens || 0,
        };
    return { text, stopReason, usage };
  }

  let { text, stopReason, usage } = await attempt(maxTokens);
  // All-thinking, no text: the model hit the ceiling before answering.
  // Retry once with triple the room instead of failing the run. The retry's
  // tokens are added to the first attempt's rather than replacing them: the
  // first call was billed and pretending otherwise understates the cost.
  if (!text && (stopReason === 'max_tokens' || stopReason === 'length')) {
    const first = usage || {};
    ({ text, stopReason, usage } = await attempt(maxTokens * 3));
    usage = {
      input_tokens: (first.input_tokens || 0) + (usage?.input_tokens || 0),
      output_tokens: (first.output_tokens || 0) + (usage?.output_tokens || 0),
      cache_read_input_tokens: (first.cache_read_input_tokens || 0) + (usage?.cache_read_input_tokens || 0),
      cache_creation_input_tokens: (first.cache_creation_input_tokens || 0) + (usage?.cache_creation_input_tokens || 0),
    };
  }
  if (!text) throw new Error('The AI returned an empty response. Run it again — if it keeps happening, try a different model in Settings.');
  return { text, usage: usage || {}, stopReason };
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const task = String(body?.task || '');
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const ws = ctx.workspace;
  const db = getDb();
  const settings = await loadEngineSettings(db, ws);
  const apiKey = (await openSecret(secretEnv(), String(settings.aiKey || '').trim())).trim();
  const model = String(settings.aiModel || '').trim() || 'claude-sonnet-5';
  if (!apiKey) {
    return NextResponse.json(
      { error: 'No API key saved. Add your Anthropic or OpenAI key in Settings → AI Hive key.' },
      { status: 400 }
    );
  }

  // The one route that spends the user's own AI credit gets a daily
  // ceiling. Every other endpoint had a throttle; this one could be looped
  // into a drained key. Admin-adjustable via /api/limits (aiCallsPerDay).
  const limits = await loadLimits(db, ws);
  const used = (await readAiCalls(db, ws)) + 1;
  if (limits.aiCallsPerDay > 0 && used > limits.aiCallsPerDay) {
    return NextResponse.json(
      { error: `Daily AI limit reached (${limits.aiCallsPerDay} calls). It resets at midnight UTC, or an admin can raise it in workspace limits.` },
      { status: 429 }
    );
  }

  // Permission before money. This gate used to sit inside the try, below the
  // charge, so a workspace with no bee allowance was billed 20 to 150 credits
  // and then told it was not allowed to run the thing it had just paid for.
  const BEE_TASKS = new Set(['reply-coach', 'call-prep', 'proposal', 'voice-note', 'best5', 'objections', 'content-scripts']);
  if (BEE_TASKS.has(task) && ctx.role !== 'admin') {
    if (!limits.beesPerDay) {
      return NextResponse.json(
        { error: 'The Hive bees are not switched on for this workspace yet. Ask Ary to give you an allowance.' },
        { status: 403 }
      );
    }
    const beeRuns = (await readAiCalls(db, ws, 'bees')) + 1;
    if (beeRuns > limits.beesPerDay) {
      return NextResponse.json(
        { error: `Daily bee limit reached (${limits.beesPerDay} runs). It resets at midnight UTC.` },
        { status: 429 }
      );
    }
  }

  // Credits, the only currency the app talks about. Charged before the work,
  // refunded if the work refuses, so a failure never costs anything.
  const JOB_FOR_TASK = { score: 'lead-score', draft: 'lead-draft' };
  const job = JOB_FOR_TASK[task] || task;
  const charge = await spendCredits(db, ws, job);
  if (!charge.ok) {
    return NextResponse.json(
      { error: `${OUT_OF_CREDITS} This one costs ${charge.price} credit${charge.price === 1 ? '' : 's'} and there ${charge.balance === 1 ? 'is' : 'are'} ${charge.balance} left.`, outOfCredits: true },
      { status: 402 }
    );
  }
  const refund = () => refundCredits(db, ws, charge.price).catch(() => {});

  // Which model this particular task deserves. Eleven tasks all went to the
  // one configured model, so pulling three fields out of a dictated sentence
  // ran on the same model as reading a 300-row pipeline. See lib/ai-cost.mjs
  // for the split; the configured model stays the ceiling.
  const taskModel = modelForTask(task, model);
  // Tokens are summed rather than replaced: a task that makes more than one
  // call is billed for all of them, and a ledger that records only the last
  // one understates every multi-call task.
  const spent = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  // Whether any call in this task hit its output ceiling. Lowering a cap is a
  // guess without this: a task that truncated looks exactly like one that
  // finished early, and the only visible difference is a worse answer.
  let truncated = false;
  const ask = async (opts) => {
    const r = await callAI({ apiKey, model: taskModel, ...opts });
    if (r.stopReason === 'max_tokens' || r.stopReason === 'length') truncated = true;
    const u = r.usage || {};
    spent.input_tokens += Number(u.input_tokens) || 0;
    spent.output_tokens += Number(u.output_tokens) || 0;
    spent.cache_read_input_tokens += Number(u.cache_read_input_tokens) || 0;
    spent.cache_creation_input_tokens += Number(u.cache_creation_input_tokens) || 0;
    return r.text;
  };


  // Counted here, past every gate: this request is going to run. The counters
  // used to be incremented while reading them, so a 402 or a 403 spent one of
  // the day's calls anyway.
  await bumpAiCalls(db, ws);
  if (BEE_TASKS.has(task) && ctx.role !== 'admin') await bumpAiCalls(db, ws, 'bees');

  // Every refusal hands the credits back, not only the ones that throw. The
  // promise in the comment above was kept by the catch alone, so all nineteen
  // early returns inside this block quietly charged for work that never
  // happened: no handles typed, no proposal template saved, nothing over the
  // view bar. Rather than trusting nineteen call sites to remember, the
  // response itself decides: anything that is not a success gets refunded.
  const run = async () => {
    if (task === 'score') {
      const leadId = Number(body.leadId);
      const lead = await db.prepare('SELECT * FROM leads WHERE id = ? AND workspace = ?').bind(leadId, ws).first();
      if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
      // You already decided this one by hand. Re-scoring would quietly
      // overwrite a judgement you made by actually looking at them.
      if (isHumanDecided(lead)) {
        return NextResponse.json({ lead, verdict: lead.verdict, skipped: 'you decided this one' });
      }
      // Ads get their own rubric — see buildVerdictParts. The rubric rides
      // as a cached system block; only the lead itself varies per call.
      const parts = buildVerdictParts(settings, lead);
      const text = await ask({ system: parts.system, prompt: parts.user });
      const parsed = parseScoringResult(text);
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 });
      const { verdict, reasons, confidence, suggestedFirstLine } = parsed.data;
      const notes = [
        lead.notes || '',
        suggestedFirstLine ? `suggested_first_line: ${suggestedFirstLine}` : '',
      ].filter(Boolean).join('\n');
      await db
        .prepare(
          `UPDATE leads SET verdict = ?, verdict_reasons = ?, confidence = ?, notes = ?, status = CASE WHEN status = 'new' THEN ? ELSE status END, updated_at = datetime('now') WHERE id = ? AND workspace = ?`
        )
        .bind(verdict, JSON.stringify(reasons), confidence, notes, statusForVerdict(verdict, confidence), leadId, ws)
        .run();
      const updated = await db.prepare('SELECT * FROM leads WHERE id = ? AND workspace = ?').bind(leadId, ws).first();
      return NextResponse.json({ lead: updated, verdict });
    }

    if (task === 'draft') {
      const leadId = Number(body.leadId);
      const lead = await db.prepare('SELECT * FROM leads WHERE id = ? AND workspace = ?').bind(leadId, ws).first();
      if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
      // Idempotent like scoring: a lead that already carries a draft is
      // skipped, so a Honey Bee batch that failed at lead 47 can be retried
      // without re-drafting (and re-paying for) the first 46. body.force
      // is the explicit escape hatch for an intentional re-draft.
      if (!body.force && (lead.notes || '').includes('--- AI draft ---')) {
        return NextResponse.json({ lead, skipped: 'already drafted' });
      }
      const parts = buildMessageWriterParts(settings, lead);
      const text = await ask({ system: parts.system, prompt: parts.user, maxTokens: 2500 });
      const notes = [(lead.notes || ''), `--- AI draft ---\n${text.trim()}`].filter(Boolean).join('\n');
      await db
        .prepare(`UPDATE leads SET notes = ?, updated_at = datetime('now') WHERE id = ? AND workspace = ?`)
        .bind(notes, leadId, ws)
        .run();
      const updated = await db.prepare('SELECT * FROM leads WHERE id = ? AND workspace = ?').bind(leadId, ws).first();
      return NextResponse.json({ lead: updated, draft: text.trim() });
    }

    if (task === 'phrases') {
      const text = await ask({
        prompt: buildBuyerFinderPrompt(settings) + '\n\nIMPORTANT: after everything else, end with a line PHRASES_JSON: followed by a JSON array of the 10 single best phrases.',
      });
      let phrases = [];
      const m = text.match(/PHRASES_JSON:\s*(\[[\s\S]*?\])/);
      if (m) {
        try { phrases = JSON.parse(m[1]).map((p) => String(p).slice(0, 200)).slice(0, 15); } catch {}
      }
      if (!phrases.length) {
        // fallback: mine plausible phrase lines
        phrases = text.split('\n')
          .map((l) => l.replace(/^[-*\d.\s"']+/, '').replace(/["']+$/, '').trim())
          .filter((l) => l && l.length >= 8 && l.length <= 80 && !/:$/.test(l) && l === l.toLowerCase())
          .slice(0, 10);
      }
      if (!phrases.length) return NextResponse.json({ error: 'Could not extract phrases from the AI reply.' }, { status: 422 });
      const merged = [...new Set([...(settings.intentPhrases || []), ...phrases])].slice(0, 60);
      const value = JSON.stringify({ ...settings, intentPhrases: merged });
      await db
        .prepare(
          `INSERT INTO settings (workspace, key, value, updated_at) VALUES (?, 'engine', ?, datetime('now'))
           ON CONFLICT(workspace, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
        )
        .bind(ws, value)
        .run();
      return NextResponse.json({ added: phrases, total: merged.length, raw: text });
    }

    if (task === 'analyze') {
      const { results } = await db
        .prepare('SELECT name, business_name, stage, rating, replied, reply_type, last_contact_date, emails_sent, country FROM prospects WHERE workspace = ? AND deleted_at IS NULL')
        .bind(ws)
        .all();
      const rows = results || [];
      const byStage = {};
      rows.forEach((r) => { byStage[r.stage || 'Unknown'] = (byStage[r.stage || 'Unknown'] || 0) + 1; });
      const summary = [
        `Total prospects: ${rows.length}`,
        `By stage: ${Object.entries(byStage).map(([k, v]) => `${k}: ${v}`).join(', ')}`,
        `Replied: ${rows.filter((r) => r.replied).length}`,
        `Contacted (emails_sent > 0): ${rows.filter((r) => (r.emails_sent || 0) > 0).length}`,
        '',
        'Rows (name | stage | replied | reply_type | last_contact | emails_sent):',
        ...rows.slice(0, 150).map((r) =>
          `${r.name || r.business_name || '?'} | ${r.stage} | ${r.replied ? 'yes' : 'no'} | ${r.reply_type || '-'} | ${r.last_contact_date || '-'} | ${r.emails_sent || 0}`
        ),
      ].join('\n');
      const prompt = [
        'You are my pipeline analyst. Below is my live prospect data, already computed from my database — do not invent metrics beyond it.',
        '',
        summary,
        '',
        'My positioning: ' + (settings.positioning || settings.offer || '(not set)'),
        '',
        'Give me: 1) where the pipeline is leaking (which stage, with evidence), 2) the 5 most neglected prospects by name and what to send each, 3) three specific actions for next week referencing actual rows. Use markdown headings. Be direct.',
      ].join('\n');
      const text = await ask({ prompt, maxTokens: 8000 });
      return NextResponse.json({ report: text.trim(), prospectCount: rows.length });
    }

    // ── The Hive bees ─────────────────────────────────────────────────
    // All of them read the same context block, so a bee can never see less
    // than the tracker knows. Prospect-scoped bees load the whole row.
    //
    // Gated on their own allowance before anything is spent: a bee call
    // carries a full prospect context, which makes it the most expensive
    // call in the app. A workspace has none until an admin grants some
    // (Settings → workspace limits); an admin's own workspace is never
    // capped, the same rule the ad scans follow.
    const prospectBees = new Set(['reply-coach', 'call-prep', 'proposal', 'voice-note']);
    if (prospectBees.has(task)) {
      const id = Number(body.prospectId);
      const p = await db.prepare('SELECT * FROM prospects WHERE id = ? AND workspace = ?').bind(id, ws).first();
      if (!p) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
      const context = buildProspectContext(p);

      if (task === 'reply-coach') {
        const replyText = String(body.replyText || '').trim();
        if (!replyText) return NextResponse.json({ error: 'Paste what they wrote back first.' }, { status: 400 });
        const parts = buildReplyCoachParts(settings, context, replyText);
        const text = await ask({ system: parts.system, prompt: parts.user, maxTokens: 1500 });
        return NextResponse.json({ draft: text.trim() });
      }

      if (task === 'call-prep') {
        const parts = buildCallPrepParts(settings, context);
        const text = await ask({ system: parts.system, prompt: parts.user, maxTokens: 2500 });
        return NextResponse.json({ brief: text.trim() });
      }

      if (task === 'proposal') {
        // Her own template, never a generated one: prices and tiers are hers.
        const { results } = await db
          .prepare(`SELECT items FROM library_groups WHERE workspace = ? AND category = 'workspace'`)
          .bind(ws)
          .all();
        let template = '';
        for (const row of results || []) {
          let items = [];
          try { items = JSON.parse(row.items || '[]'); } catch { items = []; }
          const hit = items.find((it) => /proposal/i.test(it?.title || ''));
          if (hit?.body) { template = hit.body; break; }
        }
        if (!template) {
          return NextResponse.json(
            { error: 'No proposal template found. Add one under Templates and run this again.' },
            { status: 400 }
          );
        }
        const parts = buildProposalParts(settings, context, template);
        const text = await ask({ system: parts.system, prompt: parts.user, maxTokens: 3000 });
        return NextResponse.json({ proposal: text.trim() });
      }

      // voice-note: returns a PLAN only. Nothing is written until the user
      // confirms in the drawer and the normal prospect PATCH applies it.
      const transcript = String(body.transcript || '').trim();
      if (!transcript) return NextResponse.json({ error: 'Nothing was heard.' }, { status: 400 });
      const parts = buildVoiceNoteParts({ ...settings, today: tzToday() }, context, transcript);
      const text = await ask({ system: parts.system, prompt: parts.user, maxTokens: 900 });
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return NextResponse.json({ error: 'Could not turn that into updates. Try saying it again.' }, { status: 422 });
      let plan;
      try { plan = JSON.parse(m[0]); } catch {
        return NextResponse.json({ error: 'Could not read the update plan.' }, { status: 422 });
      }
      // Only fields the bee is allowed to touch, only values it is allowed
      // to say. A hallucinated stage never reaches a confirm screen.
      const patch = {};
      if (typeof plan.note === 'string' && plan.note.trim()) patch.note = plan.note.trim().slice(0, 1000);
      if (VOICE_NOTE_ALLOWED_STAGES.includes(plan.stage)) patch.stage = plan.stage;
      // Shape alone let "2026-13-45" through, and a TEXT column will hold it
      // forever, sorting and filtering wrong.
      if (/^\d{4}-\d{2}-\d{2}$/.test(plan.next_action_date || '')
        && !Number.isNaN(Date.parse(`${plan.next_action_date}T00:00:00Z`))
        && plan.next_action_date === new Date(`${plan.next_action_date}T00:00:00Z`).toISOString().slice(0, 10)) {
        patch.next_action_date = plan.next_action_date;
      }
      if (['interested', 'defer', 'decline'].includes(plan.reply_type)) patch.reply_type = plan.reply_type;
      if (plan.call_booked === true) patch.call_booked = 1;
      if (plan.proposal_sent === true) patch.proposal_sent = 1;
      return NextResponse.json({ plan: patch, summary: String(plan.summary || '').slice(0, 300), transcript });
    }

    if (task === 'best5') {
      // The ordering is decided here, in code, not by the model.
      //
      // Four hundred rows of name/stage/date used to go to Claude with "pick
      // five", which is asking a language model to do date arithmetic and then
      // trusting the answer. It also could not see the thing that actually
      // decides the order: whether there is a verified reason to contact
      // anybody. Someone who replied yesterday outranks the best cold audit in
      // the pipeline every time, and that is a rule, so it is written as one.
      //
      // site_intel and own_findings are selected because the ranking reads
      // them. Neither was available to this task before.
      const { results } = await db
        .prepare(
          `SELECT id, name, business_name, email, domain, stage, rating, replied, reply_type,
                  reply_date, last_contact_date, next_action_date, emails_sent, video_url,
                  video_sent_at, activity_log, niche, own_findings, site_intel, audit_notes
             FROM prospects
            WHERE workspace = ? AND deleted_at IS NULL
              AND stage NOT IN ('Rejected', 'Not This Offer', 'Lost', 'Invalid Email', 'Finished', 'Client')
            ORDER BY COALESCE(last_contact_date, '0000-00-00') ASC
            LIMIT 400`
        )
        .bind(ws)
        .all();
      const today = tzToday();
      const rows = (results || []).filter((r) => r.last_contact_date !== today);
      if (!rows.length) {
        return NextResponse.json({ error: 'Everyone active has been contacted today. Nothing to pick from.' }, { status: 400 });
      }

      const picks = rankProspects(rows, { limit: 5, settings });
      if (!picks.length) {
        return NextResponse.json({ error: 'Nothing in the pipeline needs attention today.' }, { status: 400 });
      }
      // The complete answer, before the model is involved at all. If the call
      // below fails, this is what she gets, and it is still correct.
      const deterministic = renderPicks(picks);

      // Strategy V2: this is a view, not a model call.
      //
      // The ordering was already decided in code above, and the model's only
      // remaining job was rewriting five correct lines into five nicer lines.
      // At $0.033 a call on the highest-priced task in the app, that is paying
      // for prose about a list nobody disputes. The deterministic answer is
      // complete and it is what ships.
      //
      // The write-up survives as a deliberate escalation Ary can ask for, which
      // is the difference between a cost that recurs and a cost she chose.
      let text = deterministic;
      let wroteUp = false;
      if (body.writeUp === true) {
        try {
          const parts = buildBestFiveParts(settings, picksForPrompt(picks));
          const written = await ask({ system: parts.system, prompt: parts.user, maxTokens: 1600 });
          if (written && written.trim()) { text = written.trim(); wroteUp = true; }
        } catch {
          // Keep the deterministic list. A failed write-up is not a failed answer.
        }
      }

      return NextResponse.json({
        picks: text,
        considered: rows.length,
        wroteUp,
        // The ranking, separately, so the UI can show the reason next to each
        // name without trusting prose to carry it.
        ranked: picks.map((x) => ({
          id: x.prospect.id,
          name: x.prospect.name || x.prospect.business_name || `#${x.prospect.id}`,
          headline: x.headline,
          reason: x.reason,
          evidenceStrength: x.strength.level,
          manualFindings: x.evidence.manual.length,
          verifiedFindings: x.evidence.verified.length,
        })),
      });
    }

    if (task === 'content-scripts') {
      // Reference points first, scripts second. Claude inventing "a good
      // hook" from nothing is the reason AI scripts read like AI; given the
      // hooks that actually pulled views in this niche, it has something to
      // model. The posts come from Instagram profiles Ary names.
      const handles = (Array.isArray(body.handles) ? body.handles : [])
        .map((h) => String(h || '').trim().replace(/^@/, '').replace(/\/+$/, ''))
        .filter((h) => /^[A-Za-z0-9._]{1,30}$/.test(h))
        .slice(0, 5);
      if (!handles.length) {
        return NextResponse.json({ error: 'Name at least one Instagram account to learn from.' }, { status: 400 });
      }
      const minViews = Math.max(0, Math.min(Number(body.minViews) || 0, 10_000_000));
      const wanted = Math.max(1, Math.min(Number(body.count) || 5, 10));

      // The workspace's own Apify token, or the shared one the admin set.
      const e = secretEnv();
      let apify = '';
      const row = await db
        .prepare(`SELECT value FROM settings WHERE workspace = ? AND key = 'engine'`)
        .bind(ws)
        .first();
      if (row?.value) {
        try { apify = (await openSecret(e, String(JSON.parse(row.value).apifyToken || ''))).trim(); } catch {}
      }
      apify = apify || String(e.LTB_SHARED_APIFY_TOKEN || '').trim();
      if (!apify) {
        return NextResponse.json({ error: 'No Apify token saved, so there is nothing to read Instagram with.' }, { status: 400 });
      }

      // run-sync-get-dataset-items runs the actor and hands back the items in
      // one call, so there is no run to poll and no scan row to keep.
      let items = [];
      try {
        const res = await fetch(
          `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(apify)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usernames: handles }),
          }
        );
        if (!res.ok) {
          const t = await res.text().catch(() => '');
          return NextResponse.json({ error: `Instagram read failed (${res.status}). ${t.slice(0, 160)}` }, { status: 424 });
        }
        items = await res.json();
      } catch (err) {
        return NextResponse.json({ error: `Could not reach Apify: ${err.message}` }, { status: 424 });
      }

      // Flatten every profile's recent posts, score by whatever engagement the
      // actor returned, and keep the winners. Views when the post is a video,
      // likes otherwise, so a strong photo post is not thrown away.
      const posts = [];
      for (const prof of Array.isArray(items) ? items : []) {
        const who = prof?.username ? `@${prof.username}` : '@unknown';
        for (const post of Array.isArray(prof?.latestPosts) ? prof.latestPosts : []) {
          const views = Number(post?.videoViewCount || post?.videoPlayCount || 0);
          const likes = Number(post?.likesCount || 0);
          const reach = views || likes;
          if (!reach) continue;
          const caption = String(post?.caption || '').replace(/\s+/g, ' ').trim();
          if (caption.length < 15) continue;
          posts.push({ who, reach, isView: Boolean(views), caption });
        }
      }
      const winners = posts
        .filter((p) => (minViews ? p.reach >= minViews : true))
        .sort((a, b) => b.reach - a.reach)
        .slice(0, 25);
      if (!winners.length) {
        return NextResponse.json(
          {
            error: posts.length
              ? `Read ${posts.length} posts but none reached ${minViews.toLocaleString()}. Lower the bar or name bigger accounts.`
              : 'Those accounts returned no readable posts. Check the handles.',
          },
          { status: 422 }
        );
      }

      const refBlock = winners
        .map((p) => `${p.reach.toLocaleString()} ${p.isView ? 'views' : 'likes'} | ${p.who} | ${p.caption.slice(0, 220)}`)
        .join('\n');
      const parts = buildContentScriptsParts(settings, refBlock, wanted);
      const text = await ask({ system: parts.system, prompt: parts.user, maxTokens: 5000 });
      return NextResponse.json({
        scripts: text.trim(),
        readPosts: posts.length,
        usedPosts: winners.length,
        topReach: winners[0]?.reach || 0,
      });
    }

    if (task === 'objections') {
      const { results } = await db
        .prepare(
          // Newest replies first. Unordered, this read an arbitrary 300 of
          // them, so "what are people objecting to" was answered from whatever
          // the database happened to return rather than from what people have
          // been saying lately, which is the only version of the question
          // worth asking.
          `SELECT name, business_name, stage, reply_type, activity_log, call_booked, proposal_sent
             FROM prospects WHERE workspace = ? AND deleted_at IS NULL AND replied = 1
            ORDER BY COALESCE(reply_date, '0000') DESC, id DESC LIMIT 300`
        )
        .bind(ws)
        .all();
      const rows = results || [];
      if (rows.length < 3) {
        return NextResponse.json(
          { error: 'Not enough replies logged yet to find a pattern. Log what people say when they write back and come back to this.' },
          { status: 400 }
        );
      }
      const lines = rows.map((r) => {
        let said = '';
        try {
          const log = JSON.parse(r.activity_log || '[]');
          const hit = [...log].reverse().find((e) => e && e.tag === 'REPLY' && e.text);
          said = hit ? String(hit.text).replace(/^They said:\s*/i, '').slice(0, 200) : '';
        } catch {}
        const later = [r.call_booked ? 'call booked' : null, r.proposal_sent ? 'proposal sent' : null, r.stage === 'Client' ? 'became a client' : null]
          .filter(Boolean).join(', ');
        return `${r.name || r.business_name || '?'} | ${r.stage} | ${r.reply_type || 'replied'} | ${said || '(words not logged)'} | ${later || 'nothing since'}`;
      }).join('\n');
      const parts = buildObjectionParts(settings, lines);
      const text = await ask({ system: parts.system, prompt: parts.user, maxTokens: 3000 });
      return NextResponse.json({ report: text.trim(), replies: rows.length });
    }

    return NextResponse.json({ error: `Unknown task: ${task}` }, { status: 400 });
  };

  let out;
  let failed = false;
  try {
    out = await run();
  } catch (err) {
    failed = true;
    await refund();
    await recordUsage(db, { workspace: ws, task, model: taskModel, usage: spent, credits: 0, ok: false });
    console.log('ai task failed:', task);
    return NextResponse.json({ error: `That run did not finish: ${err.message}` }, { status: 424 });
  }
  const refused = !out || out.status >= 400;
  if (refused) await refund();
  // One row per run, whatever happened. A refused run still burned tokens if
  // it got as far as the model, and a ledger that only records the happy path
  // is the one that makes the numbers look good.
  if (!failed) {
    await recordUsage(db, {
      workspace: ws,
      task,
      model: taskModel,
      usage: spent,
      credits: refused ? 0 : charge.price,
      ok: !refused,
      truncated,
    });
  }
  return out;
}
