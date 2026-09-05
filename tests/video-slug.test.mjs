import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// The slug is the address the video lives at, the name the watch page is
// served under, and the key the readiness check HEADs. Two prospects landing
// on the same one means one gets the other's video at a link that has already
// been emailed, so this pins the two things that keep that from happening:
// the app and the render service agree, and no two hosts collide.
//
// Neither implementation is importable (one is an edge route, one is a Cloud
// Run service), so the shared shape is read out of both files and compared.

async function slugBodyOf(path) {
  const src = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const from = src.indexOf(".replace(/^www\\./");
  const to = src.indexOf('.slice(0, 120)');
  assert.ok(from >= 0 && to > from, `could not find the slug chain in ${path}`);
  // Comments and indentation differ between the two files and do not change
  // the answer, so only the calls are compared.
  return src
    .slice(from, to)
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\s+/g, '')
    .trim();
}

test('the app and the render service derive the same slug', async () => {
  const app = await slugBodyOf('app/api/audit-video/route.js');
  const service = await slugBodyOf('services/audit-render/server.mjs');
  assert.ok(app.length > 40, 'the extracted chain is too short to be the real one');
  assert.equal(
    app,
    service,
    'slugFor drifted between app/api/audit-video/route.js and services/audit-render/server.mjs'
  );
});

// The live rule, kept here so the collisions are stated as cases rather than
// as a regex somebody has to read.
const slugFor = (host) =>
  host
    .replace(/^www\./, '')
    .toLowerCase()
    .replace(/-/g, '--')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);

test('hosts that used to collide now get their own slug', () => {
  const cases = [
    'bodyworks.com',
    'bodyworks.ca',
    'bodyworks.net',
    'bodyworks.clinic',
    'my.clinic.com',
    'my-clinic.com',
    'shop.bodyworks.com.au',
  ];
  const slugs = cases.map(slugFor);
  assert.equal(new Set(slugs).size, cases.length, `collision in ${JSON.stringify(slugs)}`);
});

test('www is the one thing that does not make a new slug', () => {
  assert.equal(slugFor('www.bodyworks.com'), slugFor('bodyworks.com'));
});

test('every slug still satisfies the review worker SLUG_RE', () => {
  const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,127}$/;
  for (const host of ['bodyworks.com', 'my-clinic.com', 'shop.bodyworks.com.au', 'a1.co']) {
    assert.ok(SLUG_RE.test(slugFor(host)), `${host} -> ${slugFor(host)} fails SLUG_RE`);
  }
});
