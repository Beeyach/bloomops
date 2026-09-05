// Which words go out, and which conversation they go out in.
//
// Three defects sat next to each other in the send path, all found while
// auditing threading before the canary click:
//
//   1. the body was read from the package's Email 1 fields for every step, so
//      an approved Email 2 would have sent Email 1 again
//   2. the name guard read `pkg.body`, which is not a column, so it checked an
//      empty string and could never block
//   3. the thread id Gmail returns was stored and never used, so every
//      follow-up started a new conversation

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { threadFor } from '../lib/send-events.mjs';
import { preparedFollowups } from '../lib/send-guard.mjs';
import { buildMime } from '../lib/gmail-send.mjs';

const src = readFileSync(new URL('../lib/send-runner.mjs', import.meta.url), 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function fakeDb(events = []) {
  return {
    prepare(sql) {
      const q = sql.replace(/\s+/g, ' ');
      let binds = [];
      const api = {
        bind: (...b) => { binds = b; return api; },
        async first() {
          if (/FROM send_events/.test(q) && /provider_thread_id IS NOT NULL/.test(q)) {
            const [ws, pid] = binds;
            return events
              .filter((e) => e.workspace === ws && e.prospect_id === pid && e.provider_thread_id)
              .sort((a, b) => a.sequence_step - b.sequence_step)[0] || null;
          }
          return null;
        },
      };
      return api;
    },
  };
}

// ── The thread source ────────────────────────────────────────────────────

test('the thread comes from the earliest real send event', async () => {
  const db = fakeDb([
    { workspace: 'ary', prospect_id: 1, sequence_step: 1, provider_thread_id: 't-1', provider_message_id: 'm-1', subject: 'your booking form' },
    { workspace: 'ary', prospect_id: 1, sequence_step: 2, provider_thread_id: 't-1', provider_message_id: 'm-2', subject: 'your booking form' },
  ]);
  const t = await threadFor(db, 'ary', 1);
  assert.equal(t.threadId, 't-1');
  assert.equal(t.messageId, 'm-1', 'Email 1 is what a follow-up replies to');
  assert.equal(t.subject, 'your booking form');
  assert.equal(t.threaded, true);
});

test('no real thread means no thread, never an invented one', async () => {
  // Every prospect contacted before LTB could send is in this state, and the
  // canary is too: its Email 1 is synthetic with no Gmail thread.
  const t = await threadFor(fakeDb([]), 'ary', 1);
  assert.equal(t.threadId, null);
  assert.equal(t.messageId, null);
  assert.equal(t.threaded, false);
  assert.match(t.why, /No native send ever recorded a Gmail thread/);
});

test('a thread is never derived from anything but a real provider value', () => {
  const fn = String(threadFor);
  for (const guess of ['subject ===', 'email ===', 'prospect_id +', 'Date.', 'slice(0, 10)']) {
    assert.ok(!fn.includes(guess), `the thread must not be guessed from ${guess}`);
  }
});

// ── The words that go out ────────────────────────────────────────────────

test('a follow-up sends its own approved copy, not Email 1 again', () => {
  assert.ok(code.includes('const approvedStep = followup ? preparedFollowups(pkg)'),
    'the approved step is looked up');
  // Whitespace-tolerant: the body selection grew a video branch and now spans
  // several lines. What must stay true is that a follow-up's words come from
  // the approved step, and that Email 1's body is not the fallback for one.
  const pick = /outgoingBody\s*=\s*followup\s*\?([\s\S]{0,200}?):\s*\(pkg\.edited_body/.exec(code);
  assert.ok(pick, 'outgoingBody still branches on followup');
  assert.ok(/approvedStep\.body/.test(pick[1]),
    'and the follow-up branch resolves to the approved step body');
  assert.ok(!/pkg\.email_body/.test(pick[1]),
    'Email 1 body is never reachable from the follow-up branch');
  assert.ok(!/const body = pkg\.edited_body \|\| pkg\.email_body/.test(code),
    'Email 1 body is no longer used for every step');
});

test('the video variant is still the approved step, not new copy', () => {
  // A follow-up may send video wording instead, but only wording that was in
  // the package Ary approved. The pick reads approvedStep and nothing else.
  assert.ok(/videoCopyFor\(approvedStep, prospect\)/.test(code),
    'the video wording is looked up on the approved step');
  assert.ok(!/videoCopyFor\(\s*pkg/.test(code),
    'never straight off the package, which would bypass the approval shape');
});

test('a follow-up with no approved body is blocked, not sent empty', () => {
  assert.ok(code.includes('has no approved body in the package'));
});

test('the approved followup body is the one the guard checked', () => {
  const pkg = { followups: JSON.stringify([{ step: 2, subject: 's2', body: 'the real email 2' }]) };
  const found = preparedFollowups(pkg).find((f) => f.step === 2);
  assert.equal(found.body, 'the real email 2');
});

// ── The name guard ───────────────────────────────────────────────────────

test('the name guard checks the words actually going out', () => {
  assert.ok(!code.includes('body: pkg.body'), 'pkg.body is not a column and never was');
  assert.ok(/checkGreeting\(\{[\s\S]{0,200}body: outgoingBody/.test(code),
    'it reads the outgoing body');
});

// ── The wiring ───────────────────────────────────────────────────────────

test('the thread id is passed to Gmail, not just stored', () => {
  assert.ok(/sendMessage\([^)]*\{ mime, threadId: thread\?\.threadId \|\| null \}/.test(code),
    'the send carries the thread');
  assert.ok(/inReplyTo: thread\?\.messageId \|\| null/.test(code));
  assert.ok(/references: thread\?\.messageId \|\| null/.test(code));
});

test('a threaded follow-up keeps Email 1 subject, an unthreaded one carries its own', () => {
  // Tolerant of the line break the video subject branch introduced.
  assert.ok(/thread\?\.threaded && thread\.subject\s*\n?\s*\?\s*thread\.subject/.test(code),
    'same conversation means same subject');
  assert.ok(/approvedStep\.subject \|\| pkg\.email_subject/.test(code),
    'and without a thread it falls back honestly');
});

test('the MIME path already supported all of this', () => {
  // Nothing new was built. The plumbing existed and was simply never called.
  const mime = buildMime({
    from: 'a@b.com', to: 'c@d.com', subject: 'your booking form', body: 'Hi.',
    inReplyTo: '<m-1@mail.gmail.com>', references: '<m-1@mail.gmail.com>', boundary: 'x',
  });
  assert.match(mime, /In-Reply-To: <m-1@mail\.gmail\.com>/);
  assert.match(mime, /References: <m-1@mail\.gmail\.com>/);
});

test('a first email is never threaded onto anything', () => {
  assert.ok(/const thread = followup \? await threadFor/.test(code),
    'only a follow-up looks for a thread');
});
