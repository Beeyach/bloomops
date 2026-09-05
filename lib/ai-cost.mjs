// What a model call actually costs, and which model a task should use.
//
// Before this the app had eleven AI tasks, all sent to whatever single model
// the workspace had configured, and no idea what any of them cost. Credit
// prices came from an estimate in a comment. This module is the arithmetic
// that replaces the guess.

// Anthropic list prices, US dollars per million tokens. Cache reads bill at
// 0.1x input and cache writes at 1.25x, which is why they are tracked apart
// rather than folded into input_tokens.
//
// Update these when Anthropic changes them. Historic rows keep the cost that
// was computed at the time, on purpose: repricing history hides the change.
export const MODEL_PRICES = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};
// Anything unrecognised is costed as Sonnet rather than as free. A missing
// price must never read as a cheap call.
const FALLBACK = { input: 3, output: 15 };

export const CACHE_READ_MULTIPLIER = 0.1;
export const CACHE_WRITE_MULTIPLIER = 1.25;

export function priceFor(model) {
  return MODEL_PRICES[String(model || '').trim()] || FALLBACK;
}

// Dollars for one call. Takes the usage block straight off the API response.
export function costOf(model, usage = {}) {
  const p = priceFor(model);
  const input = Number(usage.input_tokens) || 0;
  const output = Number(usage.output_tokens) || 0;
  const cacheRead = Number(usage.cache_read_input_tokens) || 0;
  const cacheWrite = Number(usage.cache_creation_input_tokens) || 0;
  return (
    (input / 1e6) * p.input +
    (cacheRead / 1e6) * p.input * CACHE_READ_MULTIPLIER +
    (cacheWrite / 1e6) * p.input * CACHE_WRITE_MULTIPLIER +
    (output / 1e6) * p.output
  );
}

// ── Task routing ──────────────────────────────────────────────────────────
// Every task used the workspace's one configured model, so extracting three
// fields from a dictated sentence ran on the same model as reading a whole
// pipeline. Measured on the app's real prompts, Haiku is about a third of
// Sonnet's cost for the same work on the jobs below.
//
// The split is by what the task actually demands, not by how important it
// feels:
//
//   'cheap'  — the answer is already in the input and just needs pulling out
//              or labelling. No judgement, no writing.
//   'standard' — writing in Ary's voice, or reasoning over one prospect.
//   'deep'   — reasoning across the whole pipeline, where a worse answer is
//              worth more than the money saved.
export const TASK_TIER = {
  // Reads a dictated sentence and returns which fields changed. Pure
  // extraction against a fixed schema.
  'voice-note': 'cheap',
  // Reads one post against a rubric and answers green/red with a reason.
  // Classification with the rubric supplied.
  score: 'cheap',
  // Generates search phrases from a description. Short, list-shaped.
  phrases: 'cheap',
  // Reads one short reply and picks one label off a fixed list. The cheapest
  // job in the app, and the one with the highest volume once a sequence is
  // running: spending a reasoning model to discover "not interested" is the
  // waste that makes AI features expensive for nothing.
  'classify-reply': 'cheap',
  draft: 'standard',
  // Looks at one screenshot and answers one closed question about what is
  // visibly on it. This sat on the cheap tier until Ary asked why, and the
  // answer did not survive the question.
  //
  // Two reasons it moved. Haiku 4.5 predates high-resolution vision and caps
  // images at 1568px on the long edge, so a 1920px desktop capture is
  // downscaled by roughly a fifth before the model sees it — and small buttons,
  // thin nav links and fine print are precisely what these questions are about.
  // And the fixtures that passed were easy by construction: one button dead
  // centre against no button at all. That proved the pipeline, not the
  // judgement, and nothing in it says a cheap model can tell "buried among
  // competing actions" from "fine" on a real site with a cookie banner and a
  // carousel.
  //
  // The asymmetry settles it. This whole feature exists because a wrong visual
  // claim reached three real prospects. A wrong answer costs an embarrassing
  // email; the better model costs about half a cent.
  'visual-evidence': 'standard',
  'reply-coach': 'standard',
  'call-prep': 'standard',
  proposal: 'standard',
  'content-scripts': 'standard',

  // These three read the whole table or every logged reply and have to hold
  // it all at once to say anything true.
  analyze: 'deep',
  best5: 'deep',
  objections: 'deep',
};

// The model for a tier, given what the workspace has configured. The
// configured model stays the ceiling: a workspace that chose Sonnet never
// silently gets Opus, it only gets Haiku on the jobs that do not need more.
export function modelForTask(task, configuredModel) {
  const configured = String(configuredModel || '').trim() || 'claude-sonnet-5';
  const tier = TASK_TIER[task] || 'standard';
  // Only Anthropic model ids are routed. An OpenAI key means the workspace
  // picked its own model and we do not second-guess it.
  if (!configured.startsWith('claude-')) return configured;
  if (tier === 'cheap') return 'claude-haiku-4-5';
  return configured;
}

// Records one call. Never throws: a failed ledger write must not lose the
// answer the user is waiting for.
export async function recordUsage(db, { workspace, task, model, usage = {}, credits = 0, ok = true, truncated = false }) {
  try {
    await db
      .prepare(
        `INSERT INTO ai_usage
           (workspace, task, model, input_tokens, output_tokens,
            cache_read_tokens, cache_write_tokens, cost_usd, credits_charged, ok, truncated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        workspace,
        task,
        model,
        Number(usage.input_tokens) || 0,
        Number(usage.output_tokens) || 0,
        Number(usage.cache_read_input_tokens) || 0,
        Number(usage.cache_creation_input_tokens) || 0,
        costOf(model, usage),
        Number(credits) || 0,
        ok ? 1 : 0,
        truncated ? 1 : 0
      )
      .run();
  } catch {
    // Ledger only. Losing a row costs a line in a report; throwing here would
    // cost the user their answer.
  }
}

// The margin picture for a workspace: what was charged against what it cost.
// Credits are a tenth of a cent each, which is the rate lib/credits.mjs was
// written against.
export const USD_PER_CREDIT = 0.001;

// Output-token distribution per task, so caps are lowered from evidence rather
// than from a feeling. Reports the sample size with every figure: a p90 off
// four calls is not a p90.
export function outputStats(rows = []) {
  const byTask = new Map();
  for (const r of rows) {
    const t = r.task || 'unknown';
    if (!byTask.has(t)) byTask.set(t, { task: t, out: [], truncated: 0 });
    const cur = byTask.get(t);
    cur.out.push(Number(r.output_tokens) || 0);
    if (r.truncated) cur.truncated += 1;
  }
  const pct = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))] : 0);
  return [...byTask.values()].map((t) => {
    const sorted = [...t.out].sort((a, b) => a - b);
    return {
      task: t.task,
      n: sorted.length,
      median: pct(sorted, 50),
      p90: pct(sorted, 90),
      p95: pct(sorted, 95),
      max: sorted[sorted.length - 1] || 0,
      truncated: t.truncated,
      // Below this, any recommendation is noise.
      enoughToAct: sorted.length >= 20 && t.truncated === 0,
    };
  }).sort((a, b) => b.n - a.n);
}

export function summarise(rows = []) {
  const byTask = new Map();
  let costUsd = 0;
  let credits = 0;
  let calls = 0;
  let cacheReads = 0;
  for (const r of rows) {
    const t = r.task || 'unknown';
    const cur = byTask.get(t) || { task: t, calls: 0, costUsd: 0, credits: 0, inputTokens: 0, outputTokens: 0 };
    cur.calls += 1;
    cur.costUsd += Number(r.cost_usd) || 0;
    cur.credits += Number(r.credits_charged) || 0;
    cur.inputTokens += Number(r.input_tokens) || 0;
    cur.outputTokens += Number(r.output_tokens) || 0;
    byTask.set(t, cur);
    costUsd += Number(r.cost_usd) || 0;
    credits += Number(r.credits_charged) || 0;
    cacheReads += Number(r.cache_read_tokens) || 0;
    calls += 1;
  }
  const list = [...byTask.values()].map((t) => ({
    ...t,
    chargedUsd: t.credits * USD_PER_CREDIT,
    // How many times over the credit price covers the real cost. Below 1
    // means the task is sold at a loss.
    margin: t.costUsd > 0 ? (t.credits * USD_PER_CREDIT) / t.costUsd : null,
  }));
  list.sort((a, b) => b.costUsd - a.costUsd);
  return {
    calls,
    costUsd,
    credits,
    chargedUsd: credits * USD_PER_CREDIT,
    margin: costUsd > 0 ? (credits * USD_PER_CREDIT) / costUsd : null,
    // Zero here after a full day of use means the cache_control markers are
    // doing nothing, which is worth knowing rather than assuming.
    cacheReadTokens: cacheReads,
    byTask: list,
  };
}
