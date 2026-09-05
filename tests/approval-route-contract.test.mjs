import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { GUARD_FIELDS, guardView } from '../lib/prospect-view.mjs';

const routeSource = readFileSync(
  new URL('../app/api/outreach/route.js', import.meta.url),
  'utf8'
).replace(/^\s*\/\/.*$/gm, '');

test('the live approval query selects every field required by the outbound guard', () => {
  const select = routeSource.slice(
    routeSource.indexOf('SELECT k.*'),
    routeSource.indexOf('FROM outreach_packages')
  );

  assert.match(select, /SELECT k\.\*/, 'package prospect_id supplies the guarded id alias');

  for (const field of GUARD_FIELDS.filter((field) => field !== 'id')) {
    assert.match(
      select,
      new RegExp('p\\.' + field + '\\b'),
      `the guard requires ${field}, but /api/outreach does not select it`
    );
  }
});

test('the approval queue can build a complete guard view from its joined row', () => {
  const row = {
    prospect_id: 7,
    name: 'Ary',
    business_name: 'Bloomwired',
    prospect_email: 'hello@example.com',
    stage: 'Email 2',
    replied: 1,
    reply_type: 'interested',
    reply_date: '2026-08-09',
    last_contact_date: '2026-08-08',
    next_action_date: '2026-08-10',
    do_not_contact: 0,
    unsubscribed: 0,
  };

  const view = guardView(row, {
    aliases: { id: 'prospect_id', email: 'prospect_email' },
    where: 'approval queue regression test',
  });

  assert.equal(view.reply_date, '2026-08-09');
  assert.equal(view.last_contact_date, '2026-08-08');
});
