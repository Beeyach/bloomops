import { NextResponse } from 'next/server';
import { getDb, STAGES } from '@/lib/db';
import { DEFAULT_ENGINE_SETTINGS, LEAD_PLATFORMS } from '@/lib/engine-prompts.mjs';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { sanitizeSequenceTemplate } from '@/lib/sequence-template.mjs';
import { sealSecret } from '@/lib/secret-box.mjs';
import { getCloudflareContext } from '@opennextjs/cloudflare';

// Cloudflare secrets arrive on the request context env; local dev falls
// back to process.env (or the secret-box dev default).
function secretEnv() {
  try {
    const { env } = getCloudflareContext();
    if (env) return env;
  } catch {}
  return typeof process !== 'undefined' && process.env ? process.env : {};
}

// aiKey/apifyToken are encrypted at rest and NEVER returned to the browser.
// GET replaces them with '' plus aiKeySet/apifyTokenSet flags. PUT semantics
// for those two fields: '' or missing = keep the stored secret, the literal
// '__clear__' = remove it, anything else = encrypt and store the new value.
const CLEAR = '__clear__';

function redact(stored) {
  const { aiKey, apifyToken, ...rest } = stored;
  return {
    ...rest,
    aiKey: '',
    apifyToken: '',
    aiKeySet: Boolean(aiKey),
    apifyTokenSet: Boolean(apifyToken),
  };
}

// Force-dynamic: this route reads per-request state from D1 and must never be prerendered.
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const db = getDb();
  const row = await db
    .prepare(`SELECT value FROM settings WHERE workspace = ? AND key = ?`)
    .bind(ctx.workspace, 'engine')
    .first();
  let stored = {};
  if (row && row.value) {
    try {
      stored = JSON.parse(row.value);
    } catch {
      stored = {};
    }
  }
  return NextResponse.json({ settings: redact({ ...DEFAULT_ENGINE_SETTINGS, ...stored }) });
}

function asStringList(value, maxItems, maxLen) {
  if (!Array.isArray(value)) return null;
  const out = value
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0)
    .slice(0, maxItems);
  if (out.some((v) => v.length > maxLen)) return null;
  return out;
}

export async function PUT(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  // Two write shapes:
  //   { settings: {...} }  the whole object (what the Settings screen sends)
  //   { patch: {...} }     a partial, merged over the STORED object here on
  //                        the server — so a writer that only touches one
  //                        field can no longer clobber fields it never saw
  //                        (two concurrent saves used to silently eat each
  //                        other's changes).
  const db = getDb();
  const prevRow = await db
    .prepare(`SELECT value FROM settings WHERE workspace = ? AND key = ?`)
    .bind(ctx.workspace, 'engine')
    .first();
  let prev = {};
  if (prevRow && prevRow.value) {
    try { prev = JSON.parse(prevRow.value); } catch { prev = {}; }
  }

  let s = body && body.settings;
  if (!s && body && body.patch && typeof body.patch === 'object') {
    s = { ...prev, ...body.patch };
    // Stored secrets are sealed; feeding them back through the validator
    // would seal them twice. An absent secret in the patch means "keep",
    // which the resolver expresses as empty-incoming.
    if (!('aiKey' in body.patch)) s.aiKey = '';
    if (!('apifyToken' in body.patch)) s.apifyToken = '';
  }
  if (!s || typeof s !== 'object') {
    return NextResponse.json({ error: 'Missing "settings" or "patch" object' }, { status: 400 });
  }

  // Who the workspace is. Named in every AI prompt that has to name somebody,
  // so a runaway value here would land in a real email: short caps, and no
  // newlines, which would break the single-line sentence they sit inside.
  const oneLine = (v, max) => String(v || '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);
  const operatorName = oneLine(s.operatorName, 80);
  const businessName = oneLine(s.businessName, 80);
  const offer = String(s.offer || '').slice(0, 2000);
  const audience = String(s.audience || '').slice(0, 2000);
  const greenRules = asStringList(s.greenRules, 50, 200);
  const redRules = asStringList(s.redRules, 50, 200);
  if (greenRules === null || redRules === null) {
    return NextResponse.json(
      { error: 'greenRules and redRules must be arrays of strings (max 200 chars each)' },
      { status: 400 }
    );
  }
  const platforms = Array.isArray(s.platforms)
    ? s.platforms.filter((p) => LEAD_PLATFORMS.includes(p))
    : DEFAULT_ENGINE_SETTINGS.platforms;
  const positioning = String(s.positioning || '').slice(0, 600);

  // Sending controls. Every one of these decides whether a machine writes to a
  // stranger, so each is read explicitly and each falls back to off rather
  // than to whatever was in the object.
  const bool = (v) => v === true;
  const clamp = (v, d, lo, hi) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
  };
  const autoSendApprovedFirstEmails = bool(s.autoSendApprovedFirstEmails);
  const autoSendApprovedFollowups = bool(s.autoSendApprovedFollowups);
  const dailySendLimit = clamp(s.dailySendLimit, 20, 0, 500);
  const hourlySendLimit = clamp(s.hourlySendLimit, 5, 0, 100);
  const sendWindowStartHour = clamp(s.sendWindowStartHour, 8, 0, 23);
  const sendWindowEndHour = clamp(s.sendWindowEndHour, 17, 1, 24);
  const minimumDelayAfterApprovalMinutes = clamp(s.minimumDelayAfterApprovalMinutes, 15, 0, 1440);
  const maxReplyStalenessMinutes = clamp(s.maxReplyStalenessMinutes, 30, 5, 720);
  const sendDays = Array.isArray(s.sendDays)
    ? [...new Set(s.sendDays.map(Number).filter((d) => d >= 0 && d <= 6))]
    : [1, 2, 3, 4, 5];
  const workspaceTimezone = String(s.workspaceTimezone || 'America/Los_Angeles').slice(0, 60);
  const aiModel = String(s.aiModel || '').trim().slice(0, 100);

  // Secrets: keep unless replaced or explicitly cleared (prev was loaded
  // above, before the patch merge) — an empty field never wipes a saved key.
  async function resolveSecret(incoming, stored) {
    const v = String(incoming || '').trim().slice(0, 300);
    if (!v) return stored || '';
    if (v === CLEAR) return '';
    return sealSecret(secretEnv(), v);
  }
  const aiKey = await resolveSecret(s.aiKey, prev.aiKey);
  const apifyToken = await resolveSecret(s.apifyToken, prev.apifyToken);
  const promptProjects = Array.isArray(s.promptProjects)
    ? s.promptProjects
        .filter((p) => p && typeof p === 'object' && String(p.name || '').trim())
        .slice(0, 12)
        .map((p) => ({
          id: String(p.id || crypto.randomUUID()).slice(0, 40),
          name: String(p.name || '').trim().slice(0, 80),
          who: String(p.who || '').slice(0, 300),
          offer: String(p.offer || '').slice(0, 300),
          platform: String(p.platform || '').slice(0, 40),
          notes: String(p.notes || '').slice(0, 500),
        }))
    : [];
  const voiceSamples = asStringList(s.voiceSamples ?? [], 5, 1500);
  if (voiceSamples === null) {
    return NextResponse.json(
      { error: 'voiceSamples must be an array of strings (max 1500 chars each)' },
      { status: 400 }
    );
  }
  const intentPhrases = asStringList(s.intentPhrases ?? DEFAULT_ENGINE_SETTINGS.intentPhrases, 60, 200);
  if (intentPhrases === null) {
    return NextResponse.json(
      { error: 'intentPhrases must be an array of strings (max 200 chars each)' },
      { status: 400 }
    );
  }

  const sequenceTemplate = sanitizeSequenceTemplate(s.sequenceTemplate);

  // Only real stage names survive, so a stale or hand-edited value can
  // never hide something that doesn't exist or corrupt the picker.
  const hiddenStages = Array.isArray(s.hiddenStages)
    ? [...new Set(s.hiddenStages.filter((x) => STAGES.includes(x)))]
    : [];

  const value = JSON.stringify({ autoSendApprovedFirstEmails, autoSendApprovedFollowups, dailySendLimit, hourlySendLimit, sendWindowStartHour, sendWindowEndHour, sendDays, workspaceTimezone, minimumDelayAfterApprovalMinutes, maxReplyStalenessMinutes, operatorName, businessName, offer, audience, positioning, voiceSamples, greenRules, redRules, platforms, intentPhrases, aiKey, aiModel, apifyToken, promptProjects, hiddenStages, sequenceTemplate });
  await db
    .prepare(
      `INSERT INTO settings (workspace, key, value, updated_at) VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(workspace, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .bind(ctx.workspace, 'engine', value)
    .run();

  return NextResponse.json({ settings: redact(JSON.parse(value)) });
}
