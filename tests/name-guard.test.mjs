// Is this email greeting the right person?
//
// An approved email to Mary Ann Johnson opened "Hi Heidi,". A human caught it,
// which is not a control.
//
// The asymmetry these tests protect: a false block costs Ary ten seconds, a
// false pass costs a stranger's first impression and cannot be taken back. So
// the guard blocks only on a clear mismatch and stays quiet about everything
// else — and most of what follows is about the "stays quiet" half, because
// that is what makes the blocking half trustworthy enough to leave switched on.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { checkGreeting, greetingName, blocksSend, NAME_CHECK } from '../lib/name-guard.mjs';

const src = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const code = (f) => src(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const check = (body, expectedName, businessName = '') => checkGreeting({ body, expectedName, businessName });

// ── The one that started it ──────────────────────────────────────────────

test('Mary Ann does not get an email that opens Hi Heidi', () => {
  const r = check('Hi Heidi,\n\nI had a look at your site.', 'Mary Ann Johnson');
  assert.equal(r.result, NAME_CHECK.MISMATCH);
  assert.equal(blocksSend(r), true);
  // Both names in one sentence, so the problem is obvious without opening it.
  assert.match(r.reason, /Hi Heidi/);
  assert.match(r.reason, /Mary Ann Johnson/);
  assert.ok(!/undefined|null|\[object/.test(r.reason), 'no technical debris in what Ary reads');
});

test('the other real mismatches', () => {
  for (const [greet, who] of [['Judy', 'Leah Brennan'], ['Kym', 'Heidi Marsh'], ['Heidi', 'Renée Dubois']]) {
    const r = check(`Hi ${greet},\n\nSomething.`, who);
    assert.equal(r.result, NAME_CHECK.MISMATCH, `${greet} vs ${who} must be caught`);
  }
});

// ── Everything that must NOT block ───────────────────────────────────────

test('the right name passes, however it is written', () => {
  for (const body of ['Hi Judy,', 'hello judy!', 'Hey Judy -', 'Dear Judy,', 'Good morning Judy,']) {
    const r = check(`${body}\n\nSomething.`, 'Judy Alvarez');
    assert.equal(r.result, NAME_CHECK.OK, `"${body}" must pass`);
  }
});

test('greetings that name nobody pass', () => {
  for (const body of ['Hi there,', 'Hello,', 'Hi,', 'Good morning,', 'Hey team,', 'Hi all,']) {
    const r = check(`${body}\n\nSomething.`, 'Mary Ann Johnson');
    assert.equal(r.result, NAME_CHECK.OK, `"${body}" addresses nobody in particular`);
  }
});

test('no greeting at all passes', () => {
  assert.equal(check('I had a look at your website and noticed a couple of things.', 'Mary Ann Johnson').result, NAME_CHECK.OK);
  assert.equal(check('', 'Mary Ann Johnson').result, NAME_CHECK.OK);
});

test('a shortened first name is the same person', () => {
  assert.equal(check('Hi Mary,', 'Mary Ann Johnson').result, NAME_CHECK.OK);
  assert.equal(check('Hi Chris,', 'Christina Reyes').result, NAME_CHECK.OK);
  assert.equal(check('Hi Bob,', 'Robert Hale').result, NAME_CHECK.OK);
  assert.equal(check('Hi Liz,', 'Elizabeth Warren-Smith').result, NAME_CHECK.OK);
});

test('Jon and John are not a mismatch', () => {
  assert.equal(check('Hi Jon,', 'John Baker').result, NAME_CHECK.OK);
  assert.equal(check('Hi John,', 'Jon Baker').result, NAME_CHECK.OK);
});

test('accents and punctuation are not a mismatch', () => {
  assert.equal(check('Hi Renee,', 'Renée Dubois').result, NAME_CHECK.OK);
  assert.equal(check('Hi Renée,', 'Renee Dubois').result, NAME_CHECK.OK);
  assert.equal(check("Hi O'Brien,", 'Sean OBrien').result, NAME_CHECK.OK);
});

test('greeting by surname passes', () => {
  assert.equal(check('Hi Johnson,', 'Mary Ann Johnson').result, NAME_CHECK.OK);
  assert.equal(check('Dear Dr. Chen,', 'Wei Chen').result, NAME_CHECK.OK);
});

test('greeting the business is not greeting the wrong person', () => {
  const r = check('Hi Bloomwired,\n\nSomething.', 'Mary Ann Johnson', 'Bloomwired');
  assert.equal(r.result, NAME_CHECK.OK);
});

test('an initial is not evidence of anything', () => {
  assert.equal(check('Hi J,', 'Mary Ann Johnson').result, NAME_CHECK.OK);
});

test('when we do not know their name, it warns rather than blocks', () => {
  // A record with only a business name. Refusing to send to every one of those
  // would block most of the list to prevent a problem we have no evidence of.
  const r = check('Hi Heidi,\n\nSomething.', '', 'Bloomwired');
  assert.equal(r.result, NAME_CHECK.UNSURE);
  assert.equal(blocksSend(r), false, 'reported, never blocking');
  assert.match(r.reason, /no contact name/);
});

// ── Reading the greeting ─────────────────────────────────────────────────

test('only the opening lines count as a greeting', () => {
  // A name further down is a mention, not a greeting, and treating it as one
  // is where false blocks come from.
  const body = 'Hi there,\n\nI spoke to Heidi about this last week.\n\nAry';
  assert.equal(check(body, 'Mary Ann Johnson').result, NAME_CHECK.OK);
});

test('a multi-part first name is read whole', () => {
  const g = greetingName('Hi Mary Ann,\n\nSomething.');
  assert.equal(g.raw, 'Mary Ann');
  assert.deepEqual(g.parts, ['mary', 'ann']);
});

test('a greeting that runs into other words stops at the name', () => {
  const g = greetingName('Hi Mary at Bloomwired,\n\nSomething.');
  assert.equal(g.raw, 'Mary');
});

// ── Where it runs ────────────────────────────────────────────────────────

test('the guard is in the canonical send path, before anything is written', () => {
  const runner = code('../lib/send-runner.mjs');
  assert.match(runner, /checkGreeting\(\{/);
  const guardAt = runner.indexOf('blocksSend(nameCheck)');
  const preWrite = runner.indexOf('INSERT OR IGNORE INTO send_attempts');
  // The provider CALL, not the import at the top of the file.
  const send = runner.search(/await\s+sendMessage\(/);
  assert.ok(guardAt > 0 && guardAt < preWrite, 'it blocks before the attempt is claimed');
  assert.ok(send < 0 || guardAt < send, 'and long before anything reaches Gmail');
});

test('every native send goes through the one function that checks', () => {
  // sendApproved is the only place that talks to the provider, so guarding it
  // guards manual sends and follow-ups alike. Bolting the check onto a button
  // would leave the other paths open.
  const runner = code('../lib/send-runner.mjs');
  assert.match(runner, /export async function sendApproved/);
  for (const f of ['../app/api/send/route.js', '../lib/runner.mjs']) {
    let s = '';
    try { s = code(f); } catch { continue; }
    if (!s.includes('gmail') && !s.includes('Gmail')) continue;
    assert.ok(!/messages\/send/.test(s), `${f} must not call the provider directly`);
  }
});

test('a blocked send is terminal and never silently fixed', () => {
  const runner = code('../lib/send-runner.mjs');
  const block = runner.slice(runner.indexOf('blocksSend(nameCheck)'), runner.indexOf('blocksSend(nameCheck)') + 500);
  assert.match(block, /BLOCK\.WRONG_NAME/);
  assert.match(block, /terminal: true/, 'retrying the same wrong name would just fail again');
  assert.ok(!/replace\(/.test(block), 'the name is never rewritten for her');
});

test('the guard changed nothing about how mail is built or deduplicated', () => {
  const runner = code('../lib/send-runner.mjs');
  // The dedupe key and the attempt record are untouched by this pass.
  assert.match(runner, /attemptKey\(\{ prospectId: pkg\.prospect_id, sequenceStep: step, fingerprint: verdict\.fingerprint \}\)/);
  assert.match(runner, /INSERT OR IGNORE INTO send_attempts/);
  const guard = code('../lib/name-guard.mjs');
  for (const forbidden of ['buildMime', 'quotedPrintable', 'fetch(', 'gmail', 'send_attempts']) {
    assert.ok(!guard.includes(forbidden), `the guard must not touch ${forbidden}`);
  }
});

test('it is deterministic, with no model anywhere near it', () => {
  const guard = code('../lib/name-guard.mjs');
  for (const forbidden of ['askBackground', 'callAI', 'anthropic', 'openai', 'model']) {
    assert.ok(!guard.toLowerCase().includes(forbidden.toLowerCase()), `no ${forbidden} in a safety check`);
  }
});
