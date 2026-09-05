// Credits: the only currency anyone in Leads That Bloom ever sees.
//
// Underneath, different jobs cost money in different places and different
// units, and none of that is a workspace's problem. A scan is worth more than
// scoring one lead, a recorded video is worth more than either, and that is
// the whole model: one number that goes down, and Ary tops it back up.
//
// Nothing here mentions where the money actually goes. That is deliberate:
// the vocabulary of the app is credits, and the plumbing stays plumbing.

// The scale: one credit is roughly a tenth of a cent of real cost, so the
// numbers feel generous while the RATIOS stay honest. The ratios are the part
// that matters. Before this they were not: a scan cost 25 and a video 40,
// when a scan really costs about ten times what a video does, so a workspace
// could burn a fortune on scans while barely moving the number they were
// watching. Anything added here gets priced the same way: work out what it
// actually costs, multiply by a thousand.
export const PRICES = {
  // Leads
  'lead-score': 5,
  'lead-draft': 5,
  phrases: 15,
  // Prospect bees
  'reply-coach': 20,
  'call-prep': 20,
  proposal: 25,
  'voice-note': 10,
  // Pipeline bees
  analyze: 60,
  best5: 60,
  objections: 50,
  'content-scripts': 150,
  // Site work
  precheck: 20,
  video: 200,
  // A scan is not one price: you choose how many results you want, and what
  // it costs outside scales almost entirely with that number. A flat fee
  // overcharged a small scan and undercharged a big one, which is the same
  // dishonest-ratio problem one level down. Base for starting the run, then
  // a rate for every result it brings back.
  scan: 100,
  'scan-result': 4,
};

// What each price buys, in the words the app uses. Shown on the credits
// panel so a number has a meaning attached to it.
export const PRICE_LABELS = [
  ['Score or draft one lead', PRICES['lead-score']],
  ['A phrase sweep', PRICES.phrases],
  ['Ask a bee about one prospect', PRICES['reply-coach']],
  ['Check if a site needs a video', PRICES.precheck],
  ['A weekly report, the five picks, or the replies read-out', PRICES.analyze],
  ['Instagram scripts', PRICES['content-scripts']],
  ['Recording one audit video', PRICES.video],
  [`A lead scan: ${PRICES.scan} to start, then ${PRICES['scan-result']} per result`, PRICES.scan],
];

export const DEFAULT_CREDITS = 0;

// What a scan of this size costs, all in. The one price in the app that
// depends on what was asked for.
export function scanPrice(count) {
  const n = Math.max(0, Math.round(Number(count) || 0));
  return PRICES.scan + PRICES['scan-result'] * n;
}

// Charges an amount worked out by the caller, for the jobs whose price is not
// a fixed number. Same contract as spendCredits: nothing is taken when the
// balance will not cover it.
export async function spendExact(db, workspace, amount, { action = 'scan', actor = 'human', prospectId = null } = {}) {
  const price = Math.max(0, Math.round(Number(amount) || 0));
  const out = await mutate(db, workspace, (c) =>
    c.balance < price ? null : { balance: c.balance - price, spentAllTime: c.spentAllTime + price }
  );
  if (!out.ok) return { ok: false, balance: out.balance, price };
  await note(db, workspace, { action, credits: price, actor, prospectId });
  return { ok: true, balance: out.balance, price };
}

export function priceOf(job) {
  return PRICES[job] ?? 1;
}

export async function loadCredits(db, workspace) {
  const row = await db
    .prepare(`SELECT value FROM settings WHERE workspace = ? AND key = 'credits'`)
    .bind(workspace)
    .first();
  if (!row?.value) return { balance: DEFAULT_CREDITS, spentAllTime: 0 };
  try {
    const v = JSON.parse(row.value);
    return {
      balance: Math.max(0, Math.round(Number(v.balance) || 0)),
      spentAllTime: Math.max(0, Math.round(Number(v.spentAllTime) || 0)),
    };
  } catch {
    return { balance: DEFAULT_CREDITS, spentAllTime: 0 };
  }
}

// One line in the ledger per charge or refund.
//
// The balance alone could answer "how much is left" and nothing else. Every
// question worth asking about the economics is per action: which ones cost the
// most, which of the spend was automatic, what a single prospect consumed on
// its way to being ready. None of that is recoverable from a running total.
//
// Never throws. A ledger row is worth less than the job the caller is doing.
async function note(db, workspace, { action, credits, kind = 'charge', actor = 'human', prospectId = null }) {
  if (!action || !credits) return;
  try {
    await db
      .prepare(`INSERT INTO credit_events (workspace, action, credits, kind, actor, prospect_id) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(workspace, String(action).slice(0, 60), Math.round(credits), kind, actor, prospectId)
      .run();
  } catch {
    // Deliberately silent.
  }
}

async function write(db, workspace, next) {
  await db
    .prepare(
      `INSERT INTO settings (workspace, key, value, updated_at) VALUES (?, 'credits', ?, datetime('now'))
       ON CONFLICT(workspace, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .bind(workspace, JSON.stringify(next))
    .run();
}

// ── Spending, when more than one worker is spending ──────────────────────
//
// Read the balance, subtract, write it back. Fine for as long as only one thing
// was ever charging at a time, which was true while the queue ran jobs one
// after another. It stops being true the moment two scanner items run at once:
// both read 500, both write 480, and one of the two site checks was free.
//
// Nobody would have noticed quickly. The money only ever leaks in Ary's favour,
// so there is no error, no failed job, and no complaint. The ledger would just
// quietly stop matching the balance.
//
// So the write is conditional on the value not having changed since it was
// read. A loser changes no rows, re-reads, and tries again with the number that
// actually won. This is the standard optimistic lock, and it is the reason the
// raw stored string is carried around rather than the parsed object: the string
// is the thing being compared.

// How many times a caller will re-read and try again.
//
// Each attempt only loses if another worker committed in between, and there are
// at most SCANNER_CONCURRENCY + a person of those. Five is far more than enough
// and still terminates rather than spinning.
const SWAP_ATTEMPTS = 5;

async function readRaw(db, workspace) {
  const row = await db
    .prepare(`SELECT value FROM settings WHERE workspace = ? AND key = 'credits'`)
    .bind(workspace)
    .first()
    .catch(() => null);
  return row?.value ?? null;
}

function parseCredits(raw) {
  if (!raw) return { balance: DEFAULT_CREDITS, spentAllTime: 0 };
  try {
    const v = JSON.parse(raw);
    return {
      balance: Math.max(0, Math.round(Number(v.balance) || 0)),
      spentAllTime: Math.max(0, Math.round(Number(v.spentAllTime) || 0)),
    };
  } catch {
    return { balance: DEFAULT_CREDITS, spentAllTime: 0 };
  }
}

// Write `next` only if the row still holds `prevRaw`. Returns whether we won.
async function swap(db, workspace, prevRaw, next) {
  const json = JSON.stringify(next);

  // No row yet. INSERT rather than UPDATE, and let the primary key decide which
  // of two first-time writers wins; the loser re-reads and sees a real row.
  if (prevRaw == null) {
    try {
      await db
        .prepare(`INSERT INTO settings (workspace, key, value, updated_at) VALUES (?, 'credits', ?, datetime('now'))`)
        .bind(workspace, json)
        .run();
      return true;
    } catch {
      return false;
    }
  }

  const res = await db
    .prepare(
      `UPDATE settings SET value = ?, updated_at = datetime('now')
        WHERE workspace = ? AND key = 'credits' AND value = ?`
    )
    .bind(json, workspace, prevRaw)
    .run()
    .catch(() => ({ meta: { changes: 0 } }));
  return Boolean(res?.meta?.changes);
}

// Move the balance by a signed amount, atomically.
//
// `decide` gets the current numbers and returns either the new ones or null to
// refuse. Refusing is how "not enough credits" stays correct under concurrency:
// the check and the write are the same attempt, so two workers cannot both see
// enough for the last charge.
async function mutate(db, workspace, decide) {
  for (let i = 0; i < SWAP_ATTEMPTS; i += 1) {
    const raw = await readRaw(db, workspace);
    const current = parseCredits(raw);
    const next = decide(current);
    if (!next) return { ok: false, ...current };
    if (await swap(db, workspace, raw, next)) return { ok: true, ...next };
  }
  // Every attempt lost a race. Refusing is the safe answer: the caller has not
  // done the work yet, and a refusal costs nothing.
  const current = parseCredits(await readRaw(db, workspace));
  return { ok: false, contended: true, ...current };
}

// Charges the workspace for a job. Returns { ok, balance, price }. When the
// balance will not cover it, nothing is taken and ok is false, so the caller
// can refuse before doing the work rather than after paying for it.
export async function spendCredits(db, workspace, job, times = 1, { actor = 'human', prospectId = null } = {}) {
  const price = priceOf(job) * Math.max(1, Math.round(times));
  const out = await mutate(db, workspace, (c) =>
    c.balance < price ? null : { balance: c.balance - price, spentAllTime: c.spentAllTime + price }
  );
  if (!out.ok) return { ok: false, balance: out.balance, price, ...(out.contended ? { contended: true } : {}) };
  await note(db, workspace, { action: job, credits: price, actor, prospectId });
  return { ok: true, balance: out.balance, price };
}

// Puts credits back. Used when a job is refused after being charged, so a
// failure never costs anything.
export async function refundCredits(db, workspace, price, { action = 'refund', prospectId = null } = {}) {
  const amount = Math.max(0, Math.round(Number(price) || 0));
  if (!amount) return;
  await mutate(db, workspace, (c) => ({
    balance: c.balance + amount,
    spentAllTime: Math.max(0, c.spentAllTime - amount),
  }));
  // Signed negative, so a period's net spend is one SUM and cannot drift out
  // of step with a separately-counted refund total.
  await note(db, workspace, { action, credits: -amount, kind: 'refund', prospectId });
}

// Admin sets a balance outright. Ary keeps hers high and tops it back up
// when it runs low; Ellen gets whatever Ary decides.
export async function setCredits(db, workspace, balance) {
  const n = Math.max(0, Math.min(Math.round(Number(balance) || 0), 10_000_000));
  const { spentAllTime } = await loadCredits(db, workspace);
  await write(db, workspace, { balance: n, spentAllTime });
  return n;
}

export const OUT_OF_CREDITS =
  'You are out of credits. Ary can top the workspace back up in Settings.';
