import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPost, filterPosts } from '../lib/post-filter.mjs';

// Fixtures are real text from the scan for "looking for someone to manage my
// calendar and client intake", which returned 42 posts and made 41 leads.

test('drops a VA advertising themselves', () => {
  const r = classifyPost("Christiana Effiong is my name. I'm a skilled Virtual Assistant with proven track record of providing administrative and operational support. I specialize in calendar management.");
  assert.equal(r.keep, false);
  assert.match(r.reason, /supplier/);
});

test('drops the softer supplier pitch', () => {
  const r = classifyPost("I'm currently partnering with businesses and entrepreneurs to provide dependable remote administrative assistance tailored to their needs. My goal is to help streamline operations.");
  assert.equal(r.keep, false);
  assert.match(r.reason, /supplier/);
});

test('drops AI-written story bait', () => {
  const r = classifyPost('She Spoke One Sicilian Word—Then the Mafia Boss Knew She Was More Than a Translator. She had spent eleven years perfecting the art of being no one. '.repeat(8));
  assert.equal(r.keep, false);
  assert.match(r.reason, /narrative|request/);
});

test('drops a promo even when it ends in a question mark', () => {
  // "Are you next? 🥰" — a question mark is not an ask.
  const r = classifyPost("I have had not one, not two, but THREE brides take advantage of this years' Christmas in July sale. Are you next? 🥰");
  assert.equal(r.keep, false);
});

test('drops a personal update that merely mentions a calendar', () => {
  const r = classifyPost('Have you ever had one of those weeks where your calendar is packed but every event reminds you why you love what you do? This was one of those weeks!');
  assert.equal(r.keep, false);
});

test('keeps a real owner asking for a recommendation', () => {
  const r = classifyPost('Does anyone know a good booking system for a small therapy practice? People message me and I lose track.');
  assert.equal(r.keep, true);
});

test('keeps an owner describing the problem in their own words', () => {
  const r = classifyPost('I keep losing leads because nobody follows up fast enough. How do you handle intake when you are with a client all day?');
  assert.equal(r.keep, true);
});

test('keeps a short ask for help', () => {
  assert.equal(classifyPost('Need help with client follow up, we are dropping enquiries every week.').keep, true);
});

test('a long post still survives if it contains a genuine ask', () => {
  const long = 'Some background about my clinic. '.repeat(40) + ' Can anyone recommend someone to fix our booking path?';
  assert.equal(classifyPost(long).keep, true);
});

test('empty and junk input is dropped, not crashed on', () => {
  assert.equal(classifyPost('').keep, false);
  assert.equal(classifyPost(null).keep, false);
  assert.equal(classifyPost(undefined).keep, false);
});

test('filterPosts reports why things were dropped', () => {
  const posts = [
    { message: "I'm a skilled Virtual Assistant offering calendar support." },
    { message: 'Does anyone know a good scheduler for a small clinic?' },
    { message: 'Big news, 20% off this week only.' },
  ];
  const { kept, dropped } = filterPosts(posts);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].message, 'Does anyone know a good scheduler for a small clinic?');
  // A thin result set has to be explainable, not mysterious.
  assert.ok(Object.keys(dropped).length >= 2);
});

test('the real batch would have been almost entirely rejected', () => {
  const realBatch = [
    "Christiana Effiong is my name. I'm a skilled Virtual Assistant with proven track record.",
    'She Spoke One Sicilian Word—Then the Mafia Boss Knew She Was More Than a Translator. ' + 'x'.repeat(1000),
    "I brought my wife lunch because I thought she was too busy to eat.",
    "I have had not one, not two, but THREE brides take advantage of this years' Christmas in July sale. Are you next?",
    "I'm currently partnering with businesses and entrepreneurs to provide dependable remote administrative assistance.",
    'Does anyone know who handles intake for small practices?',
  ].map((message) => ({ message }));
  const { kept } = filterPosts(realBatch);
  assert.equal(kept.length, 1, 'only the genuine ask should survive');
});

test('narrative prose does not count as an ask', () => {
  // Real miss: "someone used to being the gate between important people"
  // matched a buyer pattern meant for "has anyone used X". It let a 2,000
  // character AI story through as the single survivor of a 41-post batch.
  const story = 'I brought my wife lunch because I thought she was too busy to eat. Part 1. The security guard laughed, friendly in the careless way of someone used to being the gate between important people and everyone else. ' + 'The story continued. '.repeat(60);
  const r = classifyPost(story);
  assert.equal(r.keep, false);
});

test('"has anyone used" is still a real ask', () => {
  assert.equal(classifyPost('Has anyone used a booking tool that handles reminders? Mine keeps double booking.').keep, true);
});

test('serialised bait is dropped even when short', () => {
  assert.equal(classifyPost('She never expected the call. Part 2 coming tomorrow, does anyone want it?').keep, false);
});
