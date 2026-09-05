// Client lifecycle. "Onboarded / not" could not say that someone is paused,
// which is the state that actually needs watching — a paused client is
// revenue you still have a relationship with.
export const CLIENT_STAGES = ['Onboarding', 'Active', 'Paused', 'Ended'];

export const DEFAULT_CLIENT_STAGE = 'Onboarding';

export function normalizeStage(value) {
  return CLIENT_STAGES.includes(value) ? value : DEFAULT_CLIENT_STAGE;
}

// Labelled links to things that live in Drive: the contract, brand assets,
// invoices. Only http(s) survives — a javascript: or data: URL in a field
// that renders as a clickable link is a script waiting to run.
export function normalizeFiles(value) {
  const list = Array.isArray(value) ? value : [];
  const out = [];
  for (const f of list.slice(0, 30)) {
    const url = String(f?.url || '').trim().slice(0, 2000);
    if (!/^https?:\/\//i.test(url)) continue;
    out.push({
      label: String(f?.label || '').trim().slice(0, 120) || hostLabel(url),
      url,
    });
  }
  return out;
}

function hostLabel(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'Link'; }
}

export function parseFiles(raw) {
  if (Array.isArray(raw)) return normalizeFiles(raw);
  try { return normalizeFiles(JSON.parse(raw || '[]')); } catch { return []; }
}
