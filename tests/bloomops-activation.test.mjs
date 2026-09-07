import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testDb, testAuth, run, one, all, memoryMailer, APP_URL } from './_bloomops-db.mjs';
import { runBootstrap } from '../lib/bloomops/bootstrap.mjs';
import { loadActor, loadClientResource, evaluate } from '../lib/bloomops/authorization.mjs';
import { resolveWorkspaceAccess } from '../lib/bloomops/membership.mjs';
import { activateClient, DELIVERY_LEASE_MS } from '../lib/bloomops/client-activation.mjs';
import {
  acceptInvitation,
  lookupInvitation,
  createInvitation,
  resendInvitation,
  revokeInvitation,
} from '../lib/bloomops/invitations.mjs';
import { listContacts } from '../lib/bloomops/client-contacts.mjs';

async function setup(slugs = ['social-media-management', 'ads'], auth = false) {
  const t = auth ? testAuth() : testDb();
  await runBootstrap(t.d1, {
    workspaceName: 'Agency A',
    owner: { email: 'owner@example.com' },
    admin: { email: 'admin@example.com' },
  });
  await runBootstrap(t.d1, {
    workspaceName: 'Agency B',
    owner: { email: 'b-owner@example.com' },
    admin: { email: 'b-admin@example.com' },
  });
  t.ws = one(t.raw, "SELECT * FROM workspaces WHERE slug='agency-a'");
  t.foreign = one(t.raw, "SELECT * FROM workspaces WHERE slug='agency-b'");
  t.actorFor = async (id) =>
    loadActor(t.db, await resolveWorkspaceAccess(t.db, id, { workspaceId: t.ws.id }));
  t.owner = one(t.raw, "SELECT * FROM user WHERE email='owner@example.com'");
  t.actor = await t.actorFor(t.owner.id);
  run(
    t.raw,
    "INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES('client',?,'James','james')",
    t.ws.id,
  );
  run(
    t.raw,
    "INSERT INTO client_contacts(id,workspace_id,client_id,name,email,is_primary) VALUES('contact',?,'client','James','james@example.com',1)",
    t.ws.id,
  );
  for (const slug of slugs)
    run(
      t.raw,
      "INSERT INTO service_engagements(id,workspace_id,client_id,service_type_id) SELECT ?,?,'client',id FROM service_types WHERE workspace_id=? AND slug=?",
      slug,
      t.ws.id,
      t.ws.id,
      slug,
    );
  t.mailer ||= memoryMailer();
  t.options = {
    actor: t.actor,
    clientId: 'client',
    mailer: t.mailer,
    appUrl: 'http://localhost:3000',
    workspaceName: t.ws.name,
  };
  t.activate = (extra = {}) => activateClient(t.db, { ...t.options, ...extra });
  t.user = () => {
    run(
      t.raw,
      "INSERT INTO user(id,name,email,email_verified) VALUES('james-user','James','james@example.com',1)",
    );
    return { id: 'james-user', email: 'james@example.com' };
  };
  t.token = () => t.mailer.sent.at(-1)?.text.match(/\/invite\/([A-Za-z0-9_-]+)/)[1];
  return t;
}
const count = (t, table) => one(t.raw, `SELECT count(*) AS n FROM ${table}`).n;
const core = (t) =>
  [
    'onboarding_instances',
    'onboarding_instance_templates',
    'onboarding_items',
    'onboarding_item_services',
    'client_activations',
  ].map((table) => all(t.raw, `SELECT * FROM ${table} ORDER BY rowid`));
const events = (t, type) => all(t.raw, 'SELECT * FROM activity_events WHERE event_type=?', type);

test('activation selects all real open services, merges Meta, commits once, and delivers a contact-bound token', async () => {
  const t = await setup();
  const r = await t.activate({ serviceEngagementIds: ['ads'] });
  assert.equal(r.ok, true);
  assert.equal(r.deliveryStatus, 'sent');
  assert.equal(
    one(t.raw, "SELECT relationship_status FROM bloomops_clients WHERE id='client'").relationship_status,
    'onboarding',
  );
  assert.deepEqual(
    core(t).map((rows) => rows.length),
    [1, 3, 5, 3, 1],
  );
  const meta = one(t.raw, "SELECT id FROM onboarding_items WHERE logical_key='meta_business_access'");
  assert.equal(
    all(t.raw, 'SELECT * FROM onboarding_item_services WHERE onboarding_item_id=?', meta.id).length,
    2,
  );
  const invitation = one(t.raw, 'SELECT * FROM workspace_invitations');
  assert.equal(invitation.role, 'client');
  assert.equal(invitation.client_id, 'client');
  assert.equal(invitation.email, 'james@example.com');
  assert.equal(count(t, 'client_invitation_contacts'), 1);
  assert.equal(JSON.stringify(core(t)).includes(t.token()), false);
  assert.notEqual(invitation.token_hash, t.token());
  for (const type of ['CLIENT_ACTIVATED', 'ONBOARDING_STARTED', 'CLIENT_INVITED', 'INVITATION_SENT'])
    assert.equal(events(t, type).length, 1, type);
  const before = core(t);
  const again = await t.activate();
  assert.equal(again.alreadyActivated, true);
  assert.deepEqual(core(t), before);
  assert.equal(t.mailer.sent.length, 1);
  assert.equal(
    all(
      t.raw,
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('projects','actions','deliverables')",
    ).length,
    0,
  );
});

test('mail failure leaves a singular core and retries only invitation delivery', async () => {
  const t = await setup();
  const first = await t.activate({
    mailer: {
      send: async () => {
        throw new Error('fake failure');
      },
    },
  });
  assert.equal(first.ok, true);
  assert.equal(first.deliveryStatus, 'failed');
  const before = core(t).slice(0, 4);
  const oldHash = one(t.raw, 'SELECT token_hash FROM workspace_invitations').token_hash;
  assert.equal(events(t, 'CLIENT_INVITED').length, 0);
  const retry = await t.activate({ retryOnly: true });
  assert.equal(retry.deliveryStatus, 'sent');
  assert.deepEqual(core(t).slice(0, 4), before);
  assert.notEqual(one(t.raw, 'SELECT token_hash FROM workspace_invitations').token_hash, oldHash);
  assert.equal(count(t, 'workspace_invitations'), 1);
  for (const type of ['CLIENT_ACTIVATED', 'ONBOARDING_STARTED', 'CLIENT_INVITED'])
    assert.equal(events(t, type).length, 1);
});

test('acceptance links only the explicit contact and retry grants nothing new', async () => {
  const t = await setup();
  await t.activate();
  const user = t.user();
  const accepted = await acceptInvitation(t.db, { token: t.token(), user });
  assert.equal(accepted.ok, true);
  assert.equal(one(t.raw, "SELECT user_id FROM client_contacts WHERE id='contact'").user_id, user.id);
  assert.equal((await acceptInvitation(t.db, { token: t.token(), user })).alreadyAccepted, true);
  const actor = await t.actorFor(user.id);
  assert.equal(
    evaluate(actor, { action: 'client.view', resource: await loadClientResource(t.db, t.ws.id, 'client') })
      .allowed,
    true,
  );
  assert.equal(JSON.stringify(await listContacts(t.db, t.ws.id, 'client')).includes(user.id), false);
  assert.equal(events(t, 'INVITATION_ACCEPTED').length, 1);
});

for (const role of ['team_member', 'client'])
  test(`${role} cannot activate even with department, assignment or ownership`, async () => {
    const t = await setup();
    run(t.raw, "INSERT INTO user(id,name,email) VALUES('denied','Denied','denied@example.com')");
    run(
      t.raw,
      "INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES('denied-member',?,'denied',?,'active')",
      t.ws.id,
      role,
    );
    run(
      t.raw,
      "INSERT INTO client_assignments(workspace_id,client_id,membership_id) VALUES(?,'client','denied-member')",
      t.ws.id,
    );
    run(
      t.raw,
      "INSERT INTO department_memberships(workspace_id,department_id,membership_id) SELECT ?,id,'denied-member' FROM departments WHERE workspace_id=?",
      t.ws.id,
      t.ws.id,
    );
    run(t.raw, "UPDATE bloomops_clients SET owner_membership_id='denied-member' WHERE id='client'");
    const actor = await t.actorFor('denied');
    const r = await t.activate({ actor });
    assert.equal(r.ok, false);
    assert.equal(count(t, 'client_activations'), 0);
    assert.equal(t.mailer.sent.length, 0);
  });
test('foreign client and absent client are indistinguishable, suspended membership is rechecked', async () => {
  const t = await setup();
  run(
    t.raw,
    "INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES('foreign',?,'Foreign','foreign')",
    t.foreign.id,
  );
  assert.deepEqual(await t.activate({ clientId: 'foreign' }), await t.activate({ clientId: 'absent' }));
  run(t.raw, "UPDATE workspace_memberships SET status='suspended' WHERE id=?", t.actor.membershipId);
  assert.equal((await t.activate()).reason, 'forbidden');
  assert.equal(count(t, 'onboarding_instances'), 0);
});
for (const status of ['onboarding', 'active', 'paused', 'completed', 'ended'])
  test(`a first activation never rewrites ${status}`, async () => {
    const t = await setup();
    run(t.raw, "UPDATE bloomops_clients SET relationship_status=? WHERE id='client'", status);
    assert.equal((await t.activate()).reason, 'not_draft');
    assert.equal(count(t, 'onboarding_instances'), 0);
  });
for (const [change, reason] of [
  ['UPDATE client_contacts SET is_primary=0', 'primary_contact_required'],
  ['UPDATE client_contacts SET email=NULL', 'primary_email_required'],
  ["UPDATE client_contacts SET email='broken'", 'primary_email_required'],
  ["UPDATE service_engagements SET status='completed'", 'services_required'],
  ["UPDATE templates SET active=0 WHERE slug='social'", 'missing_published_template'],
])
  test(`precondition ${reason} writes no core or invitation`, async () => {
    const t = await setup();
    run(t.raw, change);
    const before = count(t, 'activity_events');
    assert.equal((await t.activate()).reason, reason);
    assert.equal(count(t, 'onboarding_instances'), 0);
    assert.equal(count(t, 'workspace_invitations'), 0);
    assert.equal(count(t, 'activity_events'), before);
  });
test('corrupt required publication fails before lifecycle or activity', async () => {
  const t = await setup();
  t.raw.exec('DROP TRIGGER template_versions_immutable_update');
  run(
    t.raw,
    "UPDATE template_versions SET definition_hash='corrupt' WHERE template_id IN (SELECT id FROM templates WHERE workspace_id=? AND slug='ads')",
    t.ws.id,
  );
  assert.equal((await t.activate()).reason, 'invalid_definition');
  assert.equal(count(t, 'client_activations'), 0);
  assert.equal(
    one(t.raw, "SELECT relationship_status FROM bloomops_clients WHERE id='client'").relationship_status,
    'draft',
  );
});
test('Content Calendar needs Common only and no invented team prerequisite', async () => {
  const t = await setup(['content-calendar']);
  const r = await t.activate();
  assert.equal(r.deliveryStatus, 'sent');
  assert.deepEqual(
    core(t).map((x) => x.length),
    [1, 1, 3, 0, 1],
  );
  assert.equal(count(t, 'client_assignments'), 0);
  assert.equal(count(t, 'service_assignments'), 0);
});
test('terminal services are excluded while every open status is included', async () => {
  const t = await setup(['social-media-management', 'ads', 'ghl', 'kajabi', 'content-calendar']);
  for (const [id, status] of [
    ['social-media-management', 'paused'],
    ['ads', 'active'],
    ['ghl', 'onboarding'],
    ['kajabi', 'cancelled'],
  ])
    run(t.raw, 'UPDATE service_engagements SET status=? WHERE id=?', status, id);
  const before = all(t.raw, 'SELECT id,status FROM service_engagements ORDER BY id');
  await t.activate();
  assert.deepEqual(all(t.raw, 'SELECT id,status FROM service_engagements ORDER BY id'), before);
  assert.equal(
    one(t.raw, "SELECT count(*) AS n FROM onboarding_items WHERE logical_key='kajabi_access'").n,
    0,
  );
  assert.equal(one(t.raw, "SELECT count(*) AS n FROM onboarding_items WHERE logical_key='ghl_access'").n, 1);
});
test('a late core activity failure rolls back lifecycle, all A8 rows and activation together', async () => {
  const t = await setup();
  t.raw.exec(
    "CREATE TRIGGER a9_late_failure BEFORE INSERT ON activity_events WHEN NEW.event_type='ONBOARDING_STARTED' BEGIN SELECT RAISE(ABORT,'forced late failure'); END",
  );
  await assert.rejects(t.activate());
  assert.deepEqual(
    core(t).map((r) => r.length),
    [0, 0, 0, 0, 0],
  );
  assert.equal(events(t, 'CLIENT_ACTIVATED').length, 0);
  assert.equal(t.mailer.sent.length, 0);
  assert.equal(
    one(t.raw, "SELECT relationship_status FROM bloomops_clients WHERE id='client'").relationship_status,
    'draft',
  );
});
test('concurrent first activations converge without duplicate core, activity or mail', async () => {
  const t = await setup();
  const results = await Promise.all([t.activate(), t.activate(), t.activate()]);
  assert.ok(
    results.every((r) => r.ok || ['existing_open_instance', 'activation_conflict'].includes(r.reason)),
    JSON.stringify(results),
  );
  assert.deepEqual(
    core(t).map((r) => r.length),
    [1, 3, 5, 3, 1],
  );
  for (const type of ['CLIENT_ACTIVATED', 'ONBOARDING_STARTED', 'CLIENT_INVITED'])
    assert.equal(events(t, type).length, 1, type);
  assert.equal(t.mailer.sent.length, 1);
});
test('concurrent retries are fenced to one mail attempt', async () => {
  const t = await setup();
  await t.activate({
    mailer: {
      send: async () => {
        throw Error('fake');
      },
    },
  });
  const results = await Promise.all([t.activate({ retryOnly: true }), t.activate({ retryOnly: true })]);
  assert.ok(results.every((r) => r.ok));
  assert.equal(t.mailer.sent.length, 1);
  assert.equal(events(t, 'CLIENT_INVITED').length, 1);
});
test('a crashed sender lease expires and allows recovery without core regeneration', async () => {
  const t = await setup();
  await t.activate({
    mailer: {
      send: async () => {
        throw Error('fake');
      },
    },
  });
  const now = new Date();
  run(
    t.raw,
    "UPDATE client_activations SET delivery_status='sending',delivery_attempt_id='crashed',delivery_lease_until=?",
    new Date(now.getTime() + DELIVERY_LEASE_MS).toISOString(),
  );
  assert.equal((await t.activate({ now })).deliveryStatus, 'sending');
  assert.equal(t.mailer.sent.length, 0);
  assert.equal(
    (await t.activate({ now: new Date(now.getTime() + DELIVERY_LEASE_MS + 1) })).deliveryStatus,
    'sent',
  );
  assert.equal(count(t, 'onboarding_instances'), 1);
});
test('core remains idempotent after later lifecycle or onboarding completion', async () => {
  const t = await setup();
  await t.activate();
  run(t.raw, "UPDATE onboarding_instances SET status='complete'");
  run(t.raw, "UPDATE bloomops_clients SET relationship_status='active'");
  const before = core(t);
  assert.equal((await t.activate()).alreadyActivated, true);
  assert.deepEqual(core(t), before);
  assert.equal(one(t.raw, 'SELECT relationship_status FROM bloomops_clients').relationship_status, 'active');
});
test('an unrelated pending invite cannot be taken over for activation', async () => {
  const t = await setup();
  const invite = await createInvitation(t.db, {
    workspaceId: t.ws.id,
    email: 'james@example.com',
    role: 'team_member',
  });
  assert.equal((await t.activate()).deliveryStatus, 'failed');
  assert.equal((await lookupInvitation(t.db, invite.token)).invitation.role, 'team_member');
  assert.equal(count(t, 'client_invitation_contacts'), 0);
});
test('generic revoke refuses a delivered activation invitation without changing its token, core or events', async () => {
  const t = await setup();
  const activated = await t.activate();
  assert.equal(activated.ok, true);
  assert.equal(activated.deliveryStatus, 'sent');
  const invitation = one(t.raw, 'SELECT * FROM workspace_invitations');
  const link = one(t.raw, 'SELECT * FROM client_invitation_contacts WHERE invitation_id=?', invitation.id);
  assert.equal(link.workspace_id, t.ws.id);
  assert.equal(link.client_id, 'client');
  assert.equal(link.contact_id, 'contact');
  const token = t.token();
  const before = core(t);
  const beforeEvents = all(t.raw, 'SELECT * FROM activity_events ORDER BY rowid');
  const beforeClient = one(t.raw, "SELECT * FROM bloomops_clients WHERE id='client'");

  assert.deepEqual(await revokeInvitation(t.db, {
    workspaceId: t.ws.id,
    invitationId: invitation.id,
    actorMembershipId: t.actor.membershipId,
  }), { ok: false, reason: 'activation_managed' });

  assert.equal(one(t.raw, 'SELECT status FROM workspace_invitations').status, 'pending');
  assert.deepEqual(one(t.raw, 'SELECT * FROM workspace_invitations'), invitation);
  assert.deepEqual(one(t.raw, 'SELECT * FROM client_invitation_contacts'), link);
  assert.equal((await lookupInvitation(t.db, token)).state, 'pending');
  assert.equal(one(t.raw, 'SELECT delivery_status FROM client_activations').delivery_status, 'sent');
  assert.equal(events(t, 'INVITATION_REVOKED').length, 0);
  assert.deepEqual(core(t), before);
  assert.deepEqual(all(t.raw, 'SELECT * FROM activity_events ORDER BY rowid'), beforeEvents);
  assert.deepEqual(one(t.raw, "SELECT * FROM bloomops_clients WHERE id='client'"), beforeClient);
  assert.equal(t.mailer.sent.length, 1);

  // Prove the original delivered token still completes real acceptance.
  const user = t.user();
  assert.equal((await acceptInvitation(t.db, { token, user })).ok, true);
  assert.equal(one(t.raw, "SELECT user_id FROM client_contacts WHERE id='contact'").user_id, user.id);
  assert.deepEqual(core(t), before);
});

test('an activation-bound invitation cannot be retargeted by generic creation or resend', async () => {
  const t = await setup();
  await t.activate();
  const id = one(t.raw, 'SELECT id FROM workspace_invitations').id;
  assert.equal(
    (await createInvitation(t.db, { workspaceId: t.ws.id, email: 'james@example.com', role: 'admin' }))
      .reason,
    'conflict',
  );
  assert.equal(
    (await resendInvitation(t.db, { workspaceId: t.ws.id, invitationId: id })).reason,
    'activation_managed',
  );
  assert.equal((await lookupInvitation(t.db, t.token())).state, 'pending');
});
test('acceptance stays with the invited contact after a primary change, including same email elsewhere', async () => {
  const t = await setup();
  await t.activate();
  run(
    t.raw,
    "INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES('another',?,'Another','another')",
    t.ws.id,
  );
  run(
    t.raw,
    "INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES('elsewhere',?,'Elsewhere','elsewhere')",
    t.foreign.id,
  );
  for (const [id, ws] of [
    ['another', t.ws.id],
    ['elsewhere', t.foreign.id],
  ])
    run(
      t.raw,
      "INSERT INTO client_contacts(id,workspace_id,client_id,name,email,is_primary) VALUES(?,?,?,'James','james@example.com',1)",
      id,
      ws,
      id,
    );
  run(t.raw, "UPDATE client_contacts SET is_primary=0 WHERE id='contact'");
  run(
    t.raw,
    "INSERT INTO client_contacts(id,workspace_id,client_id,name,email,is_primary) VALUES('replacement',?,'client','New Contact','new@example.com',1)",
    t.ws.id,
  );
  const user = t.user();
  assert.equal((await acceptInvitation(t.db, { token: t.token(), user })).ok, true);
  assert.deepEqual(
    all(t.raw, 'SELECT id FROM client_contacts WHERE user_id=?', user.id).map((r) => r.id),
    ['contact'],
  );
  const actor = await t.actorFor(user.id);
  assert.equal(
    evaluate(actor, { action: 'client.view', resource: await loadClientResource(t.db, t.ws.id, 'another') })
      .allowed,
    false,
  );
});
test('a changed invited address fails safely without a membership or contact link', async () => {
  const t = await setup();
  await t.activate();
  const user = t.user();
  run(t.raw, "UPDATE client_contacts SET email='new@example.com' WHERE id='contact'");
  assert.equal((await acceptInvitation(t.db, { token: t.token(), user })).reason, 'conflict');
  assert.equal(one(t.raw, "SELECT count(*) AS n FROM workspace_memberships WHERE user_id='james-user'").n, 0);
});
test('wrong identity or an existing contact link cannot be claimed', async () => {
  const t = await setup();
  await t.activate();
  const user = t.user();
  run(t.raw, "INSERT INTO user(id,name,email) VALUES('wrong','Wrong','wrong@example.com')");
  assert.equal(
    (await acceptInvitation(t.db, { token: t.token(), user: { id: 'wrong', email: 'wrong@example.com' } }))
      .reason,
    'email_mismatch',
  );
  run(t.raw, "UPDATE client_contacts SET user_id='wrong' WHERE id='contact'");
  assert.equal((await acceptInvitation(t.db, { token: t.token(), user })).reason, 'conflict');
});
test('one Client membership cannot acquire an unintended second client at acceptance', async () => {
  const t = await setup();
  await t.activate();
  const user = t.user();
  run(
    t.raw,
    "INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES('prior',?,'james-user','client','active')",
    t.ws.id,
  );
  run(
    t.raw,
    "INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES('other',?,'Other','other')",
    t.ws.id,
  );
  run(
    t.raw,
    "INSERT INTO client_contacts(workspace_id,client_id,name,user_id) VALUES(?,'other','James','james-user')",
    t.ws.id,
  );
  assert.equal((await acceptInvitation(t.db, { token: t.token(), user })).reason, 'conflict');
  assert.equal(one(t.raw, "SELECT user_id FROM client_contacts WHERE id='contact'").user_id, null);
});
test('acceptance late failure rolls back membership, contact link, invitation and events', async () => {
  const t = await setup();
  await t.activate();
  const user = t.user();
  t.raw.exec(
    "CREATE TRIGGER a9_accept_late BEFORE INSERT ON activity_events WHEN NEW.event_type='INVITATION_ACCEPTED' BEGIN SELECT RAISE(ABORT,'forced late acceptance failure'); END",
  );
  await assert.rejects(acceptInvitation(t.db, { token: t.token(), user }));
  assert.equal(one(t.raw, "SELECT count(*) AS n FROM workspace_memberships WHERE user_id='james-user'").n, 0);
  assert.equal(one(t.raw, "SELECT user_id FROM client_contacts WHERE id='contact'").user_id, null);
  assert.equal(one(t.raw, 'SELECT status FROM workspace_invitations').status, 'pending');
});
test('concurrent acceptance links once and records one acceptance', async () => {
  const t = await setup();
  await t.activate();
  const user = t.user();
  const results = await Promise.all([
    acceptInvitation(t.db, { token: t.token(), user }),
    acceptInvitation(t.db, { token: t.token(), user }),
  ]);
  assert.ok(
    results.every((r) => r.ok),
    JSON.stringify(results),
  );
  assert.equal(events(t, 'INVITATION_ACCEPTED').length, 1);
});
test('new relational rows reject cross-workspace and cross-client parents at the database', async () => {
  const t = await setup();
  await t.activate();
  const invitation = await createInvitation(t.db, {
    workspaceId: t.foreign.id,
    email: 'foreign@example.com',
    role: 'client',
    clientId: 'missing',
  });
  assert.equal(invitation.ok, false);
  run(
    t.raw,
    "INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES('foreign',?,'Foreign','foreign')",
    t.foreign.id,
  );
  const fi = await createInvitation(t.db, {
    workspaceId: t.foreign.id,
    email: 'foreign@example.com',
    role: 'client',
    clientId: 'foreign',
  });
  assert.throws(
    () =>
      run(
        t.raw,
        "INSERT INTO client_invitation_contacts(invitation_id,workspace_id,client_id,contact_id) VALUES(?,?,'client','contact')",
        fi.invitation.id,
        t.ws.id,
      ),
    /FOREIGN KEY/,
  );
  assert.throws(() => run(t.raw, "UPDATE client_invitation_contacts SET contact_id='other'"), /immutable/);
  assert.throws(() => run(t.raw, 'DELETE FROM client_activations'), /immutable/);
});

test('HTTP activation and retry authorize the real session, ignore body scope, and never expose tokens', async () => {
  const { POST: activate } = await import('../app/api/bloomops/clients/[id]/activate/route.js');
  const { POST: retry } = await import('../app/api/bloomops/clients/[id]/retry-invitation/route.js');
  const t = await setup(undefined, true);
  const cookie = (await t.signIn('owner@example.com')).cookie;
  const mails = [];
  t.env.BLOOMOPS_MAIL_TRANSPORT = 'r2-dev';
  t.env.FILES = { put: async (key, value) => mails.push(JSON.parse(value)) };
  const call = async (handler, { id = 'client', session = cookie, origin = APP_URL } = {}) => {
    globalThis[Symbol.for('__cloudflare-context__')] = { env: t.env, cf: {}, ctx: {} };
    return handler(
      new Request(`${APP_URL}/api/bloomops/clients/${id}/activate`, {
        method: 'POST',
        headers: { cookie: session, origin, 'content-type': 'application/json' },
        body: JSON.stringify({
          workspaceId: t.foreign.id,
          serviceEngagementIds: [],
          actorMembershipId: 'foreign',
        }),
      }),
      { params: Promise.resolve({ id }) },
    );
  };
  assert.equal((await call(activate, { session: '' })).status, 401);
  assert.equal((await call(activate, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await call(retry)).status, 409);
  const absent = await call(activate, { id: 'missing' });
  assert.equal(absent.status, 404);
  assert.deepEqual(await absent.json(), { error: 'Not found.' });
  t.env.FILES.put = async () => {
    throw Error('local mail failure');
  };
  const first = await call(activate);
  assert.equal(first.status, 200);
  assert.equal((await first.json()).deliveryStatus, 'failed');
  t.env.FILES.put = async (key, value) => mails.push(JSON.parse(value));
  const retried = await call(retry);
  const data = await retried.json();
  assert.equal(retried.status, 200);
  assert.equal(data.deliveryStatus, 'sent');
  assert.equal(mails.length, 1);
  assert.equal(data.token, undefined);
  assert.equal(data.tokenHash, undefined);
  assert.equal(count(t, 'onboarding_items'), 5);
  run(t.raw, "UPDATE workspace_memberships SET status='suspended' WHERE id=?", t.actor.membershipId);
  assert.equal((await call(retry)).status, 403);
});
test('HTTP generic revoke enforces activation ownership for Owner/Admin and still revokes ordinary invitations', async () => {
  const { POST: revoke } = await import('../app/api/bloomops/invitations/[id]/revoke/route.js');
  const t = await setup(undefined, true);
  const ownerCookie = (await t.signIn('owner@example.com')).cookie;
  const adminCookie = (await t.signIn('admin@example.com')).cookie;
  const foreignCookie = (await t.signIn('b-owner@example.com')).cookie;
  assert.equal((await t.activate()).deliveryStatus, 'sent');
  const invitation = one(t.raw, 'SELECT * FROM workspace_invitations');
  const before = core(t);
  const beforeEvents = all(t.raw, 'SELECT * FROM activity_events ORDER BY rowid');
  const call = (id, session = ownerCookie, origin = APP_URL) => {
    globalThis[Symbol.for('__cloudflare-context__')] = { env: t.env, cf: {}, ctx: {} };
    return revoke(new Request(`${APP_URL}/api/bloomops/invitations/${id}/revoke`, {
      method: 'POST', headers: { cookie: session, origin },
    }), { params: Promise.resolve({ id }) });
  };
  assert.equal((await call(invitation.id, '')).status, 401);
  assert.equal((await call(invitation.id, ownerCookie, 'https://evil.example')).status, 403);
  const foreign = await call(invitation.id, foreignCookie);
  const missing = await call('missing', foreignCookie);
  assert.equal(foreign.status, 404);
  assert.equal(missing.status, 404);
  assert.deepEqual(await foreign.json(), await missing.json());
  for (const session of [ownerCookie, adminCookie]) {
    const response = await call(invitation.id, session);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).reason, 'activation_managed');
  }
  assert.deepEqual(one(t.raw, 'SELECT * FROM workspace_invitations'), invitation);
  assert.deepEqual(core(t), before);
  assert.deepEqual(all(t.raw, 'SELECT * FROM activity_events ORDER BY rowid'), beforeEvents);
  assert.equal((await lookupInvitation(t.db, t.token())).state, 'pending');

  const ordinary = await createInvitation(t.db, {
    workspaceId: t.ws.id, email: 'ordinary@example.com', role: 'client', clientId: 'client',
  });
  assert.equal(ordinary.ok, true);
  assert.equal(all(t.raw, 'SELECT * FROM client_invitation_contacts WHERE invitation_id=?', ordinary.invitation.id).length, 0);
  const revoked = await call(ordinary.invitation.id);
  assert.equal(revoked.status, 200);
  assert.equal((await revoked.json()).invitation.status, 'revoked');
  assert.equal((await lookupInvitation(t.db, ordinary.token)).state, 'revoked');
  assert.deepEqual(events(t, 'INVITATION_REVOKED').map(event => event.subject_id), [ordinary.invitation.id]);
  assert.deepEqual(core(t), before);
  run(t.raw, "UPDATE workspace_memberships SET status='suspended' WHERE id=?", t.actor.membershipId);
  assert.equal((await call(invitation.id)).status, 403);
});

test('every delivery role may activate, without gaining invitation administration capabilities', async () => {
  for (const role of ['admin', 'project_manager']) {
    const t = await setup();
    run(t.raw, 'UPDATE workspace_memberships SET role=? WHERE id=?', role, t.actor.membershipId);
    const actor = await t.actorFor(t.owner.id);
    assert.equal((await t.activate({ actor })).deliveryStatus, 'sent');
    if (role === 'project_manager')
      assert.equal(evaluate(actor, { action: 'invitations.manage' }).allowed, false);
  }
});
test('an unlinked existing Client membership can accept the explicit invitation', async () => {
  const t = await setup();
  const user = t.user();
  run(
    t.raw,
    "INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES('existing-client',?,'james-user','client','active')",
    t.ws.id,
  );
  assert.equal((await t.activate()).deliveryStatus, 'sent');
  const accepted = await acceptInvitation(t.db, { token: t.token(), user });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.membership.id, 'existing-client');
});
test('a contact edit during core preparation aborts the stale activation batch', async () => {
  const t = await setup();
  const batch = t.db.batch.bind(t.db);
  let first = true;
  t.db.batch = async (statements) => {
    if (first) {
      first = false;
      run(t.raw, "UPDATE client_contacts SET email='changed@example.com' WHERE id='contact'");
    }
    return batch(statements);
  };
  assert.equal((await t.activate()).reason, 'activation_conflict');
  assert.deepEqual(
    core(t).map((r) => r.length),
    [0, 0, 0, 0, 0],
  );
});
test('a purchased service added during preparation cannot be silently omitted', async () => {
  const t = await setup();
  const batch = t.db.batch.bind(t.db);
  let first = true;
  t.db.batch = async (statements) => {
    if (first) {
      first = false;
      run(
        t.raw,
        "INSERT INTO service_engagements(workspace_id,client_id,service_type_id) SELECT ?,'client',id FROM service_types WHERE workspace_id=? AND slug='ghl'",
        t.ws.id,
        t.ws.id,
      );
    }
    return batch(statements);
  };
  assert.equal((await t.activate()).reason, 'activation_conflict');
  assert.equal(count(t, 'onboarding_instances'), 0);
});
test('token rotation after acceptance validation rolls back even a newly inserted membership', async () => {
  const t = await setup();
  await t.activate();
  const user = t.user();
  const batch = t.db.batch.bind(t.db);
  t.db.batch = async (statements) => {
    run(t.raw, "UPDATE workspace_invitations SET token_hash='rotated'");
    return batch(statements);
  };
  assert.equal((await acceptInvitation(t.db, { token: t.token(), user })).reason, 'conflict');
  assert.equal(one(t.raw, "SELECT count(*) AS n FROM workspace_memberships WHERE user_id='james-user'").n, 0);
  assert.equal(one(t.raw, "SELECT user_id FROM client_contacts WHERE id='contact'").user_id, null);
});
test('a delivery-finalization failure remains recoverable and does not duplicate core events', async () => {
  const t = await setup();
  t.raw.exec(
    "CREATE TRIGGER a9_delivery_late BEFORE INSERT ON activity_events WHEN NEW.event_type='CLIENT_INVITED' BEGIN SELECT RAISE(ABORT,'fake finalization failure'); END",
  );
  assert.equal((await t.activate()).deliveryStatus, 'failed');
  assert.equal(events(t, 'CLIENT_INVITED').length, 0);
  t.raw.exec('DROP TRIGGER a9_delivery_late');
  assert.equal((await t.activate({ retryOnly: true })).deliveryStatus, 'sent');
  assert.equal(events(t, 'CLIENT_ACTIVATED').length, 1);
  assert.equal(events(t, 'CLIENT_INVITED').length, 1);
  assert.equal(count(t, 'onboarding_instances'), 1);
});

test('an expired sender cannot rotate the winning retry token after its lease was replaced', async () => {
  const t = await setup();
  await t.activate({
    mailer: {
      send: async () => {
        throw Error('fake');
      },
    },
  });
  const { workspaceInvitations } = await import('../lib/bloomops/schema.mjs');
  const update = t.db.update.bind(t.db);
  let intercept = true;
  const now = new Date();
  t.db.update = (table) => {
    const builder = update(table);
    if (table !== workspaceInvitations) return builder;
    const set = builder.set.bind(builder);
    builder.set = (values) => {
      const configured = set(values),
        where = configured.where.bind(configured);
      configured.where = (predicate) => {
        const query = where(predicate),
          returning = query.returning.bind(query);
        query.returning = async () => {
          if (intercept) {
            intercept = false;
            const winner = await t.activate({ now: new Date(now.getTime() + DELIVERY_LEASE_MS + 1) });
            assert.equal(winner.deliveryStatus, 'sent');
          }
          return returning();
        };
        return query;
      };
      return configured;
    };
    return builder;
  };
  assert.equal((await t.activate({ now })).deliveryStatus, 'sent');
  assert.equal(t.mailer.sent.length, 1);
  assert.equal((await lookupInvitation(t.db, t.token())).state, 'pending');
  assert.equal(events(t, 'CLIENT_INVITED').length, 1);
});
test('invited contacts cannot be removed through the address-book API and activity stays atomic', async () => {
  const { removeContact } = await import('../lib/bloomops/client-contacts.mjs');
  const t = await setup();
  await t.activate();
  const before = count(t, 'activity_events');
  assert.equal(
    (await removeContact(t.db, { workspaceId: t.ws.id, clientId: 'client', contactId: 'contact' })).reason,
    'invited_contact',
  );
  assert.equal(count(t, 'client_contacts'), 1);
  assert.equal(count(t, 'activity_events'), before);
});
