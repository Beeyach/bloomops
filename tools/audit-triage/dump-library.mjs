import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Resolved from this file, not from the working directory, so it runs the same
// from the repo root and from inside tools/audit-triage.
const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');

const fin = read('services/audit-render/findings.mjs');
const nar = read('services/audit-render/narrate.mjs');
const cap = read('services/audit-render/capture.mjs');
const scan = read('tools/audit-triage/scan.mjs');

// Severity per key, from the add() calls.
const sev = new Map();
for (const m of fin.matchAll(/add\(\s*'(good|minor|real)'\s*,\s*'([a-z0-9-]+)'/g)) {
  if (!sev.has(m[2])) sev.set(m[2], m[1]);
}
for (const m of fin.matchAll(/addIf\(add,\s*quoteFinding[^)]*\)/g)) {
  sev.set('quote-form-thin', 'real');
  sev.set('no-booking', 'real');
  sev.set('booking-is-a-form', 'real');
}

// Weights from the triage scanner.
const weight = new Map();
const wBlock = scan.slice(scan.indexOf('const WEIGHT'), scan.indexOf('};', scan.indexOf('const WEIGHT')));
for (const m of wBlock.matchAll(/^\s*'?([a-zA-Z][a-zA-Z0-9-]*)'?:\s*(\d+)/gm)) weight.set(m[1], Number(m[2]));

// Narration, from the GOOD and REAL tables.
function table(name) {
  const start = nar.indexOf(`const ${name} = {`);
  const end = nar.indexOf('\n};', start);
  return nar.slice(start, end);
}
function entries(src) {
  const out = new Map();
  // Key at two-space indent, then everything up to the next such key.
  const keyRe = /^  (?:\/\/.*\n  )*'?([a-zA-Z_][a-zA-Z0-9-]*)'?:\s*/gm;
  const marks = [...src.matchAll(keyRe)];
  for (let i = 0; i < marks.length; i++) {
    const from = marks[i].index + marks[i][0].length;
    const to = i + 1 < marks.length ? marks[i + 1].index : src.length;
    let body = src.slice(from, to).trim().replace(/,$/, '');
    out.set(marks[i][1], body);
  }
  return out;
}
const GOOD = entries(table('GOOD'));
const REAL = entries(table('REAL'));

// What appears on screen.
const cases = new Set([...cap.matchAll(/case '([a-z0-9-]+)':/g)].map((m) => m[1]));
const silentSrc = cap.slice(cap.indexOf('const SILENT_BEAT'), cap.indexOf('\n};', cap.indexOf('const SILENT_BEAT')));
const silent = new Set([...silentSrc.matchAll(/^  '?([a-zA-Z][a-zA-Z0-9-]*)'?:/gm)].map((m) => m[1]));

// Pull the spoken line out of a template literal or arrow function.
function spokenText(body) {
  if (!body) return null;
  const ticks = [...body.matchAll(/`([^`]*)`/g)].map((m) => m[1]);
  if (!ticks.length) return body.replace(/\s+/g, ' ').trim();
  return ticks.sort((a, b) => b.length - a.length)[0].replace(/\s+/g, ' ').trim();
}

const rows = [];
for (const [key, s] of sev) {
  const body = s === 'good' ? GOOD.get(key) : REAL.get(key);
  rows.push({
    key,
    severity: s,
    weight: weight.get(key) ?? null,
    spoken: s === 'minor' ? null : spokenText(body),
    onScreen: cases.has(key) ? 'own beat' : silent.has(key) ? 'card' : null,
  });
}
rows.sort((a, b) => (b.weight ?? -1) - (a.weight ?? -1) || a.key.localeCompare(b.key));

const lines = [];
lines.push('# Every finding the audit can make');
lines.push('');
lines.push('Generated from the code, so it cannot drift from what actually ships.');
lines.push('Regenerate with `node dump-library.mjs`.');
lines.push('');
lines.push('- **real** is spoken in the video. **minor** is recorded and never said.');
lines.push('- **good** is the one compliment the video opens with.');
lines.push('- Weight is what the triage scanner scores. 8 or more alone makes a prospect worth a video.');
lines.push('- At most three real findings are spoken per video, the three highest weighted.');
lines.push('');

for (const group of ['real', 'good', 'minor']) {
  const g = rows.filter((r) => r.severity === group);
  if (!g.length) continue;
  lines.push(`## ${group === 'real' ? 'Spoken in the video' : group === 'good' ? 'The opening compliment' : 'Recorded but never spoken'} (${g.length})`);
  lines.push('');
  for (const r of g) {
    lines.push(`### \`${r.key}\`${r.weight != null ? `  ·  weight ${r.weight}` : ''}`);
    if (r.spoken) {
      lines.push('');
      lines.push(`> ${r.spoken}`);
    }
    if (r.onScreen) lines.push(`\n*On screen: ${r.onScreen}*`);
    lines.push('');
  }
}
const outPath = join(here, 'FINDINGS-LIBRARY.md');
writeFileSync(outPath, lines.join(String.fromCharCode(10)), 'utf8');
console.log(`${rows.length} findings: ${rows.filter((r) => r.severity === 'real').length} spoken, ${rows.filter((r) => r.severity === 'good').length} good, ${rows.filter((r) => r.severity === 'minor').length} minor`);
