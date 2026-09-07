#!/usr/bin/env node
// A9 through actual workerd D1, with in-memory mail. No account credentials,
// remote bindings, real email, or existing development data are used.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getPlatformProxy } from 'wrangler';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../lib/bloomops/schema.mjs';
import { runBootstrap } from '../lib/bloomops/bootstrap.mjs';
import { loadActor } from '../lib/bloomops/authorization.mjs';
import { resolveWorkspaceAccess } from '../lib/bloomops/membership.mjs';
import { activateClient } from '../lib/bloomops/client-activation.mjs';
import { acceptInvitation } from '../lib/bloomops/invitations.mjs';
const temp = mkdtempSync(join(tmpdir(), 'bloomops-a9-smoke-'));
let proxy,
  checks = 0;
const check = (name, ok) => {
  assert.ok(ok, name);
  checks++;
  console.log(`ok   ${name}`);
};
try {
  const configPath = join(temp, 'wrangler.json');
  writeFileSync(
    configPath,
    JSON.stringify({
      name: 'bloomops-a9-local-smoke',
      compatibility_date: '2025-05-01',
      d1_databases: [
        { binding: 'DB', database_name: 'a9-disposable-local', database_id: 'a9-disposable-local' },
      ],
    }),
  );
  proxy = await getPlatformProxy({ configPath, persist: false, remoteBindings: false, envFiles: [] });
  const d1 = proxy.env.DB,
    db = drizzle(d1, { schema });
  const run = (s, ...params) =>
    d1
      .prepare(s)
      .bind(...params)
      .run();
  const one = (s, ...params) =>
    d1
      .prepare(s)
      .bind(...params)
      .first();
  const journal = JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url)));
  for (const { tag } of journal.entries)
    for (const s of readFileSync(new URL(`../drizzle/${tag}.sql`, import.meta.url), 'utf8').split(
      '--> statement-breakpoint',
    ))
      if (s.trim()) await run(s.trim());
  check('all current migrations apply to disposable D1', true);
  await runBootstrap(d1, {
    workspaceName: 'A9 Local',
    owner: { email: 'a9-owner@example.com' },
    admin: { email: 'a9-admin@example.com' },
  });
  const ws = await one('SELECT id FROM workspaces');
  const user = await one("SELECT id FROM user WHERE email='a9-owner@example.com'");
  const actor = await loadActor(db, await resolveWorkspaceAccess(db, user.id, { workspaceId: ws.id }));
  for (const client of ['happy', 'rollback']) {
    await run(
      'INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES(?,?,?,?)',
      client,
      ws.id,
      client,
      client,
    );
    await run(
      'INSERT INTO client_contacts(id,workspace_id,client_id,name,email,is_primary) VALUES(?,?,?,?,?,1)',
      `${client}-contact`,
      ws.id,
      client,
      'Contact',
      `${client}@example.com`,
    );
    await run(
      "INSERT INTO service_engagements(workspace_id,client_id,service_type_id) SELECT ?,?,id FROM service_types WHERE workspace_id=? AND slug IN ('social-media-management','ads')",
      ws.id,
      client,
      ws.id,
    );
  }
  const mails = [],
    options = {
      actor,
      clientId: 'happy',
      appUrl: 'http://localhost:8787',
      workspaceName: 'A9 Local',
      mailer: {
        send: async (m) => {
          mails.push(m);
        },
      },
    };
  const failed = await activateClient(db, {
    ...options,
    mailer: {
      send: async () => {
        throw Error('fake mail failure');
      },
    },
  });
  check('mail failure preserves committed activation', failed.ok && failed.deliveryStatus === 'failed');
  const results = await Promise.all([activateClient(db, options), activateClient(db, options)]);
  check(
    'concurrent retries succeed safely',
    results.every((r) => r.ok),
  );
  check('delivery is claimed once', mails.length === 1);
  check(
    'one onboarding instance',
    (await one("SELECT count(*) AS n FROM onboarding_instances WHERE client_id='happy'")).n === 1,
  );
  check(
    'one activation event',
    (await one("SELECT count(*) AS n FROM activity_events WHERE event_type='CLIENT_ACTIVATED'")).n === 1,
  );
  check(
    'one confirmed invitation event',
    (await one("SELECT count(*) AS n FROM activity_events WHERE event_type='CLIENT_INVITED'")).n === 1,
  );
  check(
    'Meta links both services',
    (
      await one(
        "SELECT count(*) AS n FROM onboarding_item_services s JOIN onboarding_items i ON i.id=s.onboarding_item_id WHERE i.logical_key='meta_business_access'",
      )
    ).n === 2,
  );
  const token = mails[0].text.match(/\/invite\/([A-Za-z0-9_-]+)/)[1];
  await run("INSERT INTO user(id,name,email) VALUES('contact-user','Contact','happy@example.com')");
  const accepted = await acceptInvitation(db, {
    token,
    user: { id: 'contact-user', email: 'happy@example.com' },
  });
  check('contact acceptance succeeds on D1', accepted.ok);
  check(
    'acceptance linked intended contact',
    (await one("SELECT user_id FROM client_contacts WHERE id='happy-contact'")).user_id === 'contact-user',
  );
  check(
    'acceptance retry is idempotent',
    (await acceptInvitation(db, { token, user: { id: 'contact-user', email: 'happy@example.com' } }))
      .alreadyAccepted,
  );
  await run(
    "CREATE TRIGGER a9_late_failure BEFORE INSERT ON activity_events WHEN NEW.event_type='ONBOARDING_STARTED' BEGIN SELECT RAISE(ABORT,'forced late failure'); END",
  );
  await assert.rejects(activateClient(db, { ...options, clientId: 'rollback' }));
  check(
    'D1 rolls back lifecycle after late failure',
    (await one("SELECT relationship_status FROM bloomops_clients WHERE id='rollback'"))
      .relationship_status === 'draft',
  );
  check(
    'D1 rolls back generated onboarding after late failure',
    (await one("SELECT count(*) AS n FROM onboarding_instances WHERE client_id='rollback'")).n === 0,
  );
  check(
    'D1 rolls back activation and activity after late failure',
    (await one("SELECT count(*) AS n FROM client_activations WHERE client_id='rollback'")).n === 0 &&
      (
        await one(
          "SELECT count(*) AS n FROM activity_events WHERE client_id='rollback' AND event_type='CLIENT_ACTIVATED'",
        )
      ).n === 0,
  );
  console.log(`A9 local D1 smoke: ${checks} checks passed`);
} finally {
  await proxy?.dispose();
  rmSync(temp, { recursive: true, force: true });
}
