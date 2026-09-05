#!/usr/bin/env node
// Writes a scan's verdicts into the prospect list, so the Video column in the
// app shows them and you stop re-reading a text file.
//
//   node push-results.mjs results.json            # show what would change
//   node push-results.mjs results.json --apply    # write it
//
// Reads the tail of any file the scanner produced, including a full console
// log with the table above it, so you can point it at whatever you saved.
//
// Nothing here judges a prospect. It records whether their site gave us
// something worth recording, which is the only question the scan asked.

import { readFileSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const exec = promisify(execFile);
const DB = 'bloomtrack-pro';

// ERROR is our failure, not theirs, and must never be written: a prospect
// tagged from a run whose token expired would look scanned and clean when
// nothing was ever checked. BLOCKED is written, because a site that refuses a
// browser is a real thing to know before writing an email about it.
const WRITABLE = new Set(['SEND', 'MAYBE', 'NO_VIDEO', 'BLOCKED']);

// Early scans wrote SKIP where NO_VIDEO is written now. Same meaning.
const RENAME = { SKIP: 'NO_VIDEO' };

// Domains are typed by hand, pasted from browsers, and exported from other
// tools, so the two sides rarely match character for character. Compare the
// bare hostname.
function hostOf(raw) {
  let v = String(raw || '').trim().toLowerCase();
  if (!v) return null;
  try {
    v = new URL(v.startsWith('http') ? v : `https://${v}`).hostname;
  } catch {
    v = v.replace(/^https?:\/\//, '').split('/')[0];
  }
  return v.replace(/^www\./, '') || null;
}

// The scanner prints a human table and then the JSON, so a saved console log
// has the array somewhere in the middle. Anchor on a bracket alone on its own
// line: that is the top-level array, printed at indent zero. Searching for the
// last '[' instead finds a findings array nested inside the final record.
// Line endings are normalised first, since a log saved on Windows is CRLF.
// PowerShell's `>` redirect writes UTF-16 with a byte-order mark, so a saved
// scan is usually not UTF-8. Reading it as UTF-8 gives text with a NUL between
// every character, which matches no pattern and fails as "no JSON found"
// rather than as an encoding problem.
function readText(path) {
  const buf = readFileSync(path);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.toString('utf16le', 2);
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return buf.swap16().toString('utf16le', 2);
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.toString('utf8', 3);
  return buf.toString('utf8');
}

function loadResults(path) {
  const text = readText(path).replace(/\r\n/g, '\n');
  const starts = [...text.matchAll(/^\[$/gm)];
  const start = starts.length ? starts[starts.length - 1].index : (text.trimStart().startsWith('[') ? text.indexOf('[') : -1);
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('No scan JSON found in that file. Expected the array the scanner prints last.');
  }
  return JSON.parse(text.slice(start, end + 1));
}

// wrangler prints progress lines before the JSON, and some of them contain
// brackets, so anchor on the array opening its own line at indent zero.
function parseD1(stdout) {
  const text = stdout.replace(/\r\n/g, '\n');
  const starts = [...text.matchAll(/^\[$/gm)];
  if (!starts.length) throw new Error(`Could not read wrangler's output:\n${text.slice(0, 400)}`);
  return JSON.parse(text.slice(starts[0].index));
}

async function d1Args(remote) {
  return ['wrangler', 'd1', 'execute', DB, remote ? '--remote' : '--local', '--json'];
}

// Reads go through --command. --file makes wrangler treat the SQL as a batch
// upload and hand back a "Total queries executed" summary instead of the rows,
// which looks like a successful query returning one result.
async function d1Query(sql, { remote = true } = {}) {
  const args = [...(await d1Args(remote)), '--command', JSON.stringify(sql)];
  const { stdout } = await exec('npx', args, { shell: true, maxBuffer: 128 * 1024 * 1024 });
  return parseD1(stdout);
}

// Writes go through --file, since a few hundred statements will not fit on a
// command line. The summary is all we need back.
async function d1Exec(sql, { remote = true } = {}) {
  const file = join(tmpdir(), `ltb-push-${process.pid}.sql`);
  writeFileSync(file, sql, 'utf8');
  const args = [...(await d1Args(remote)), `--file=${file}`];
  const { stdout } = await exec('npx', args, { shell: true, maxBuffer: 64 * 1024 * 1024 });
  return parseD1(stdout);
}

function sqlStr(v) {
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function main() {
  const [path, ...flags] = process.argv.slice(2);
  if (!path) {
    console.error('Usage: node push-results.mjs <scan-output.txt|json> [--apply] [--local]');
    process.exit(1);
  }
  const apply = flags.includes('--apply');
  const remote = !flags.includes('--local');

  const results = loadResults(path);
  const byHost = new Map();
  let skippedErrors = 0;
  for (const r of results) {
    const tier = RENAME[r.tier] || r.tier;
    if (!WRITABLE.has(tier)) {
      skippedErrors++;
      continue;
    }
    const host = hostOf(r.domain);
    if (!host) continue;
    // A domain can appear twice across runs. Keep the higher score, so a
    // re-scan that found more never downgrades one that found less.
    // A blocked site was never scored, it was never read. The scanner carries
    // -1 through as a sort key, which is fine in a table and reads as a real
    // measurement once it is sitting next to a prospect's name.
    const score = tier === 'BLOCKED' || r.score == null || r.score < 0 ? null : r.score;
    const prev = byHost.get(host);
    if (!prev || (score ?? -1) > (prev.score ?? -1)) {
      byHost.set(host, { tier, score });
    }
  }

  console.error(`Read ${results.length} rows, ${byHost.size} usable, ${skippedErrors} skipped as errors.`);

  const rows = await d1Query(
    "SELECT id, domain, name, business_name, video_tier, video_score FROM prospects WHERE domain IS NOT NULL AND domain != '' AND deleted_at IS NULL",
    { remote }
  );
  const prospects = rows[0]?.results || [];
  console.error(`${prospects.length} prospects have a domain.`);

  const updates = [];
  const unmatched = new Set(byHost.keys());
  for (const p of prospects) {
    const host = hostOf(p.domain);
    const hit = host && byHost.get(host);
    if (!hit) continue;
    unmatched.delete(host);
    if (p.video_tier === hit.tier && (p.video_score ?? null) === (hit.score ?? null)) continue;
    updates.push({ ...p, ...hit });
  }

  const counts = updates.reduce((acc, u) => ({ ...acc, [u.tier]: (acc[u.tier] || 0) + 1 }), {});
  console.error('');
  console.error(`${updates.length} prospects to update:`);
  for (const [t, c] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.error(`  ${t.padEnd(9)} ${c}`);
  }
  if (unmatched.size) {
    console.error('');
    console.error(`${unmatched.size} scanned domains match no prospect (renamed, deleted, or a different spelling):`);
    for (const h of [...unmatched].slice(0, 15)) console.error(`  ${h}`);
    if (unmatched.size > 15) console.error(`  ...and ${unmatched.size - 15} more`);
  }

  if (!updates.length) {
    console.error('\nNothing to write.');
    return;
  }
  if (!apply) {
    console.error('\nDry run. Add --apply to write these.');
    console.error('Sample of what would change:');
    for (const u of updates.slice(0, 8)) {
      console.error(
        `  ${(u.name || u.business_name || u.domain).slice(0, 28).padEnd(28)} ${String(u.video_tier || '—').padEnd(9)} -> ${u.tier} ${u.score ?? ''}`
      );
    }
    return;
  }

  const now = new Date().toISOString();
  const sql = updates
    .map(
      (u) =>
        `UPDATE prospects SET video_tier=${sqlStr(u.tier)}, video_score=${u.score == null ? 'NULL' : Number(u.score)}, updated_at=${sqlStr(now)} WHERE id=${Number(u.id)};`
    )
    .join('\n');
  await d1Exec(sql, { remote });
  console.error(`\nWrote ${updates.length} prospects to the ${remote ? 'remote' : 'local'} database.`);
  console.error('Search the Video column in the app, or filter on it, to see the queue.');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
