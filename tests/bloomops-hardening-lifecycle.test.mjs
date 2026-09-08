import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, snapshot, eventCount } from './_onboarding.mjs';
import { run, one, all, memoryMailer } from './_bloomops-db.mjs';
import { activateClient, activationSummary, DELIVERY_LEASE_MS } from '../lib/bloomops/client-activation.mjs';
import { acceptInvitation, lookupInvitation, INVITATION_TTL_MS } from '../lib/bloomops/invitations.mjs';
import { mutateOnboardingItem } from '../lib/bloomops/onboarding-runtime.mjs';
import { updateContact } from '../lib/bloomops/client-contacts.mjs';
import { runBootstrap } from '../lib/bloomops/bootstrap.mjs';
import {
  createOnboardingVersion,
  publishOnboardingVersion,
  currentPublishedVersion,
} from '../lib/bloomops/onboarding-templates.mjs';

async function draft(t) {
  run(
    t.raw,
    "INSERT INTO client_contacts(id,workspace_id,client_id,name,email,is_primary) VALUES('james-contact',?,'james','James','james@example.com',1)",
    t.ws,
  );
  run(
    t.raw,
    "INSERT INTO service_engagements(id,workspace_id,client_id,service_type_id) SELECT 'james-kajabi',?,'james',id FROM service_types WHERE workspace_id=? AND slug='kajabi'",
    t.ws,
    t.ws,
  );
  const mailer = memoryMailer();
  return {
    actor: t.owner,
    clientId: 'james',
    mailer,
    appUrl: 'http://localhost:3000',
    workspaceName: 'A10 Agency',
  };
}
for (const lookupFirst of [false, true])
  test(`delivered activation invitation can recover after expiry (lookup=${lookupFirst}) without duplicate lifecycle events`, async () => {
    const t = await setup();
    const options = await draft(t);
    const now = new Date();
    assert.equal((await activateClient(t.db, { ...options, now })).deliveryStatus, 'sent');
    const first = options.mailer.sent[0].text.match(/\/invite\/([A-Za-z0-9_-]+)/)[1];
    const late = new Date(now.getTime() + INVITATION_TTL_MS + 1000);
    if (lookupFirst) assert.equal((await lookupInvitation(t.db, first, { now: late })).state, 'expired');
    const before = [
      'onboarding_instances',
      'onboarding_items',
      'onboarding_item_services',
      'onboarding_instance_templates',
      'bloomops_clients',
    ].map((table) => all(t.raw, `SELECT * FROM ${table}`));
    assert.equal((await activationSummary(t.db, t.ws, 'james', { now: late })).retryAvailable, true);
    const result = await activateClient(t.db, { ...options, now: late, retryOnly: true });
    assert.equal(result.deliveryStatus, 'sent');
    assert.equal(options.mailer.sent.length, 2);
    const latest = options.mailer.sent[1].text.match(/\/invite\/([A-Za-z0-9_-]+)/)[1];
    assert.notEqual(latest, first);
    assert.equal((await lookupInvitation(t.db, latest, { now: late })).state, 'pending');
    assert.notEqual((await lookupInvitation(t.db, first, { now: late })).state, 'pending');
    assert.deepEqual(
      [
        'onboarding_instances',
        'onboarding_items',
        'onboarding_item_services',
        'onboarding_instance_templates',
        'bloomops_clients',
      ].map((table) => all(t.raw, `SELECT * FROM ${table}`)),
      before,
    );
    for (const type of ['CLIENT_ACTIVATED', 'ONBOARDING_STARTED', 'CLIENT_INVITED'])
      assert.equal(
        one(t.raw, 'SELECT count(*) n FROM activity_events WHERE client_id=? AND event_type=?', 'james', type)
          .n,
        1,
      );
  });
for (const operation of ['waive', 'not_applicable'])
  test(`concurrent ${operation} resolves once with immutable rationale`, async () => {
    const t = await setup();
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        t.mutate('agreement', operation, t.admin, { reason: 'Approved exception' }),
      ),
    );
    assert.ok(results.every((r) => r.ok));
    assert.equal(results.filter((r) => !r.unchanged).length, 1);
    assert.equal(one(t.raw, 'SELECT count(*) n FROM onboarding_item_resolutions').n, 1);
    assert.equal(
      eventCount(t, operation === 'waive' ? 'ONBOARDING_ITEM_WAIVED' : 'ONBOARDING_ITEM_NOT_APPLICABLE'),
      1,
    );
  });
test('competing waiver and N/A keep one winning rationale and event', async () => {
  const t = await setup();
  const r = await Promise.all([
    t.mutate('agreement', 'waive', t.admin, { reason: 'Waiver rationale' }),
    t.mutate('agreement', 'not_applicable', t.admin, { reason: 'N/A rationale' }),
  ]);
  assert.equal(r.filter((x) => x.ok).length, 1);
  assert.equal(eventCount(t, 'ONBOARDING_ITEM_WAIVED') + eventCount(t, 'ONBOARDING_ITEM_NOT_APPLICABLE'), 1);
  const resolved = one(t.raw, 'SELECT reason FROM onboarding_item_resolutions');
  assert.equal(
    resolved.reason,
    t.item('agreement').status === 'waived' ? 'Waiver rationale' : 'N/A rationale',
  );
});
test('multiline resolution reason from the existing textarea is usable and retained', async () => {
  const t = await setup();
  const reason = 'Approved by Ellen.\nAccess is already supplied.';
  assert.equal((await t.mutate('agreement', 'waive', t.admin, { reason })).ok, true);
  assert.equal(one(t.raw, 'SELECT reason FROM onboarding_item_resolutions').reason, reason);
});
for (const change of ['remove', 'terminal', 'primary', 'workspace', 'role'])
  test(`activation racing ${change} prerequisite change writes no core`, async () => {
    const t = await setup(),
      options = await draft(t),
      batch = t.db.batch.bind(t.db);
    let armed = true;
    t.db.batch = async (writes) => {
      if (armed) {
        armed = false;
        if (change === 'remove') run(t.raw, "DELETE FROM service_engagements WHERE id='james-kajabi'");
        if (change === 'terminal')
          run(t.raw, "UPDATE service_engagements SET status='cancelled' WHERE id='james-kajabi'");
        if (change === 'primary')
          run(t.raw, "UPDATE client_contacts SET is_primary=0 WHERE id='james-contact'");
        if (change === 'workspace') run(t.raw, "UPDATE workspaces SET status='suspended' WHERE id=?", t.ws);
        if (change === 'role')
          run(t.raw, "UPDATE workspace_memberships SET role='team_member' WHERE id=?", t.owner.membershipId);
      }
      return batch(writes);
    };
    assert.equal((await activateClient(t.db, options)).ok, false);
    assert.equal(one(t.raw, "SELECT count(*) n FROM client_activations WHERE client_id='james'").n, 0);
    assert.equal(one(t.raw, "SELECT count(*) n FROM onboarding_instances WHERE client_id='james'").n, 0);
    assert.equal(options.mailer.sent.length, 0);
  });
for (const change of ['workspace', 'role', 'visibility'])
  test(`onboarding ${change} changes before commit abort the mutation`, async () => {
    const t = await setup(),
      batch = t.db.batch.bind(t.db);
    let armed = true;
    t.db.batch = async (writes) => {
      if (armed) {
        armed = false;
        if (change === 'workspace') run(t.raw, "UPDATE workspaces SET status='suspended' WHERE id=?", t.ws);
        if (change === 'role')
          run(t.raw, "UPDATE workspace_memberships SET role='team_member' WHERE id=?", t.client.membershipId);
        if (change === 'visibility')
          run(t.raw, "UPDATE onboarding_items SET visibility='internal' WHERE id=?", t.item('agreement').id);
      }
      return batch(writes);
    };
    const before = eventCount(t, 'ONBOARDING_ITEM_COMPLETED');
    assert.equal((await t.mutate('agreement')).ok, false);
    assert.equal(t.item('agreement').status, 'pending');
    assert.equal(eventCount(t, 'ONBOARDING_ITEM_COMPLETED'), before);
  });
test('completion of a non-initial instance cannot activate the Client', async () => {
  const t = await setup();
  t.extra('followup', { clientId: 'james' });
  run(t.raw, "UPDATE bloomops_clients SET relationship_status='onboarding' WHERE id='james'");
  assert.equal(
    (
      await mutateOnboardingItem(t.db, {
        actor: t.admin,
        clientId: 'james',
        itemId: 'followup',
        operation: 'complete',
      })
    ).ok,
    true,
  );
  assert.equal(
    one(t.raw, "SELECT relationship_status s FROM bloomops_clients WHERE id='james'").s,
    'onboarding',
  );
  assert.equal(eventCount(t, 'CLIENT_ONBOARDING_COMPLETED'), 0);
});
test('contact address editing preserves accepted portal identity and activation recipient snapshot', async () => {
  const t = await setup();
  const activation = all(t.raw, 'SELECT * FROM client_activations');
  assert.equal(
    (
      await updateContact(t.db, {
        workspaceId: t.ws,
        clientId: 'lawrence',
        contactId: 'lawrence-contact',
        input: { email: 'changed@example.com' },
      })
    ).ok,
    true,
  );
  assert.equal(
    one(t.raw, "SELECT user_id FROM client_contacts WHERE id='lawrence-contact'").user_id,
    t.client.userId,
  );
  assert.deepEqual(all(t.raw, 'SELECT * FROM client_activations'), activation);
  assert.equal((await t.view()).progress.total, 4);
});
test('new master publication and repeated bootstrap cannot rewrite activated runtime or historical provenance', async () => {
  const t = await setup({ services: ['social-media-management', 'ads', 'ghl'] });
  const tables = [
    'onboarding_instances',
    'onboarding_items',
    'onboarding_instance_templates',
    'onboarding_item_services',
    'client_activations',
    'client_invitation_contacts',
  ];
  const before = tables.map((table) => all(t.raw, `SELECT * FROM ${table} ORDER BY rowid`));
  const source = await currentPublishedVersion(t.db, t.ws, 'social');
  const definition = JSON.parse(source.definitionJson);
  definition.items[0].title = 'Future template title';
  const made = await createOnboardingVersion(t.db, {
    workspaceId: t.ws,
    templateId: source.templateId,
    definition,
  });
  assert.equal(made.ok, true);
  assert.equal(
    (await publishOnboardingVersion(t.db, { workspaceId: t.ws, versionId: made.version.id })).ok,
    true,
  );
  await runBootstrap(t.d1, {
    workspaceName: 'A10 Agency',
    owner: { email: 'ellen@example.com', name: 'Ellen' },
    admin: { email: 'ary@example.com', name: 'Ary' },
  });
  assert.deepEqual(
    tables.map((table) => all(t.raw, `SELECT * FROM ${table} ORDER BY rowid`)),
    before,
  );
});

for (const kind of ['client', 'service', 'contact', 'assignment-role', 'assignment-remove'])
  test(`duplicate concurrent ${kind} edits cannot append duplicate facts`, async () => {
    const t = await setup();
    let call, type;
    if (kind === 'client') {
      const { getClient, updateClient } = await import('../lib/bloomops/clients.mjs');
      const client = await getClient(t.db, t.owner, 'lawrence');
      call = () => updateClient(t.db, { workspaceId: t.ws, client, input: { health: 'at_risk' } });
      type = 'CLIENT_HEALTH_CHANGED';
    } else if (kind === 'service') {
      const { findServiceEngagement, updateServiceEngagement } = await import('../lib/bloomops/services.mjs');
      const service = await findServiceEngagement(t.db, t.ws, 'lawrence', 'kajabi');
      call = () =>
        updateServiceEngagement(t.db, {
          workspaceId: t.ws,
          clientId: 'lawrence',
          service,
          input: { status: 'paused' },
        });
      type = 'SERVICE_STATUS_CHANGED';
    } else if (kind === 'contact') {
      call = () =>
        updateContact(t.db, {
          workspaceId: t.ws,
          clientId: 'lawrence',
          contactId: 'lawrence-contact',
          input: { name: 'Lawrence Changed' },
        });
      type = 'CLIENT_CONTACT_UPDATED';
    } else {
      const { addClientAssignment, updateClientAssignment, removeClientAssignment } = await import(
        '../lib/bloomops/assignments.mjs'
      );
      const made = await addClientAssignment(t.db, {
        workspaceId: t.ws,
        clientId: 'lawrence',
        input: { membershipId: t.admin.membershipId },
      });
      const args = {
        workspaceId: t.ws,
        clientId: 'lawrence',
        assignmentId: made.assignmentId,
        input: { assignmentRole: 'lead' },
      };
      call = () =>
        kind === 'assignment-role' ? updateClientAssignment(t.db, args) : removeClientAssignment(t.db, args);
      type = kind === 'assignment-role' ? 'CLIENT_ASSIGNMENT_UPDATED' : 'CLIENT_ASSIGNMENT_REMOVED';
    }
    const results = await Promise.all([call(), call()]);
    assert.ok(results.some((r) => r.ok));
    assert.equal(eventCount(t, type), 1);
  });

test('duplicate removal of an unlinked contact records one real removal', async () => {
  const t = await setup();
  run(
    t.raw,
    "INSERT INTO client_contacts(id,workspace_id,client_id,name) VALUES('removable',?,'lawrence','Other contact')",
    t.ws,
  );
  const { removeContact } = await import('../lib/bloomops/client-contacts.mjs');
  const results = await Promise.all(
    [1, 2].map(() =>
      removeContact(t.db, { workspaceId: t.ws, clientId: 'lawrence', contactId: 'removable' }),
    ),
  );
  assert.ok(results.some((r) => r.ok));
  assert.equal(eventCount(t, 'CLIENT_CONTACT_REMOVED'), 1);
});
