// A function that exists, is exported, and was never imported.
//
// `lib/runner.mjs` called `parseFollowUp(text)` while importing only
// `canPrepareFollowUp` from the same module. Everything compiled, every test
// passed, and the prepare-outreach job died at runtime with "parseFollowUp is
// not defined" — on the edge, inside a queue worker, where the only trace is a
// `last_error` column nobody reads until a package fails to appear.
//
// It blocked every first-contact package in production and was found by a
// person waiting for one, not by the suite.
//
// There is no linter in this project, so this is the narrowest useful stand-in:
// if a name is exported by some other module in lib/ and this file calls it,
// this file has to have imported it. It cannot catch every undefined
// reference, but it catches the one that actually happened, everywhere.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIR = new URL('../lib/', import.meta.url);
const files = readdirSync(DIR).filter((f) => f.endsWith('.mjs'));

// What exports come from. Only lib defines the names this guard knows about.
const libSrc = new Map(files.map((f) => [f, readFileSync(new URL(f, DIR), 'utf8')]));

// Who consumes them. This originally scanned lib alone, and that is exactly why
// it missed the second one: `app/api/cron/drain/route.js` called `needsRenewal`
// without importing it, and threw `needsRenewal is not defined` on every daily
// wake for days. The route directory was never looked at.
//
// Same bug, same shape, one directory over. So the consumer set is now every
// file that can call into lib, not just lib itself.
const consumers = new Map(libSrc);
const walk = (dir) => {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next') continue;
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(js|jsx|mjs)$/.test(e)) consumers.set(full, readFileSync(full, 'utf8'));
  }
};
walk('app');
walk('components');

const src = consumers;

// Strip comments and strings so a name inside prose or a template never counts.
const clean = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  // Trailing comments too, not just whole-line ones. An apostrophe in a
  // trailing comment opens a string that swallows the code after it, which is
  // how the declaration of `normalise` disappeared and the file was reported
  // for not importing something it defines itself. The `[^:]` keeps https://
  // out of it.
  .replace(/(^|[^:])\/\/.*$/gm, '$1 ')
  // Regex literals go before strings, not after. A name spelled inside one
  // counts as a call otherwise — the first version reported `FAIL()` in
  // audit-profile.mjs, which is FAIL inside /[❌✗✘]|BROKEN|FAIL(?!S)/i. And an
  // apostrophe inside a character class, as in /[a-z'-]/, opens a string that
  // swallows the code after it, which is how the declaration of `normalise`
  // vanished and its own file was reported for not importing it.
  .replace(/\/(?![/*])(?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\\n])+\/[gimsuy]*/g, '/RE/')
  .replace(/`(?:\\[\s\S]|[^`\\])*`/g, '``')
  .replace(/'(?:\\.|[^'\\])*'/g, "''")
  .replace(/"(?:\\.|[^"\\])*"/g, '""');

// Every name exported by lib, and which file exports it.
const exportedBy = new Map();
for (const [file, raw] of libSrc) {
  const code = clean(raw);
  for (const m of code.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) {
    exportedBy.set(m[1], file);
  }
  for (const m of code.matchAll(/export\s+(?:const|let|class)\s+([A-Za-z_$][\w$]*)/g)) {
    exportedBy.set(m[1], file);
  }
}

test('every lib export a file calls is one that file imported', () => {
  const missing = [];

  for (const [file, raw] of src) {
    const code = clean(raw);

    // What this file pulled in, by any spelling.
    const imported = new Set();
    for (const m of code.matchAll(/import\s+([\s\S]*?)\s+from\s+['"][^'"]*['"]/g)) {
      for (const part of m[1].replace(/[{}]/g, ',').split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop().trim();
        if (name) imported.add(name);
      }
    }

    // Anything this file binds for itself, under any spelling: a declaration,
    // an object method, a destructured parameter, a default. All four kinds
    // showed up as false alarms on the first run, so all four are checked.
    const bound = (name) => {
      const n = name.replace(/\$/g, '\\$');
      return (
        new RegExp(`\\b(?:function|const|let|var|class)\\s+${n}\\b`).test(code) ||
        new RegExp(`(?:^|[^.\\w$])(?:async\\s+)?${n}\\s*\\([^)]*\\)\\s*\\{`, 'm').test(code) ||
        new RegExp(`\\b${n}\\s*[:=][^=]`).test(code) ||
        new RegExp(`\\{[^{}]*\\b${n}\\b[^{}]*\\}\\s*(?:=|\\)|,|\\})`).test(code)
      );
    };

    // Called as a function, and not reached through a dot or a property key.
    //
    // Lookbehind rather than a consuming prefix. The first version matched
    // `(^|[^.\w$])` and therefore ate the character before the name — so in
    // `if (needsRenewal(a))` the opening bracket belonged to the `if (` match
    // and `needsRenewal` was never examined at all. Every nested call was
    // invisible, which is precisely the shape the drain route's bug had.
    for (const m of code.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
      const name = m[1];
      const owner = exportedBy.get(name);
      if (!owner || owner === file) continue;
      if (imported.has(name) || bound(name)) continue;
      missing.push(`${file} calls ${name}(), exported by ${owner}, without importing it`);
    }
  }

  assert.deepEqual([...new Set(missing)], [], `\n${[...new Set(missing)].join('\n')}\n`);
});
