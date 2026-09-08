import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTableName } from 'drizzle-orm';
import { setup } from './_onboarding.mjs';
import { run, one, all } from './_bloomops-db.mjs';
import { BLOOMOPS_TABLES } from '../lib/bloomops/schema.mjs';
import { evaluate } from '../lib/bloomops/authorization.mjs';

const cases = [
  ['provenance', 'instance'],
  ['provenance', 'version'],
  ['activation', 'client'],
  ['activation', 'instance'],
  ['activation', 'contact'],
  ['activation', 'invitation'],
  ['activation', 'actor'],
  ['association', 'client'],
  ['association', 'contact'],
  ['association', 'invitation'],
  ['submission', 'item'],
  ['submission', 'actor'],
  ['resolution', 'item'],
  ['resolution', 'actor'],
];
for (const [relation, parent] of cases)
  test(`${relation} rejects a foreign-workspace ${parent} through direct SQL`, async () => {
    const t = await setup();
    run(
      t.raw,
      "INSERT INTO onboarding_instances(id,workspace_id,client_id) VALUES('james-run',?,'james')",
      t.ws,
    );
    t.extra('foreign_step', { ws: t.otherWs, clientId: 'foreign' });
    run(
      t.raw,
      "INSERT INTO client_contacts(id,workspace_id,client_id,name,email) VALUES('james-contact',?,'james','James','james@example.com')",
      t.ws,
    );
    run(
      t.raw,
      "INSERT INTO client_contacts(id,workspace_id,client_id,name,email) VALUES('foreign-contact',?,'foreign','Foreign','foreign@example.com')",
      t.otherWs,
    );
    for (const [id, ws, client] of [
      ['james-invite', t.ws, 'james'],
      ['foreign-invite', t.otherWs, 'foreign'],
    ])
      run(
        t.raw,
        "INSERT INTO workspace_invitations(id,workspace_id,client_id,email,role,token_hash,expires_at) VALUES(?,?,?,?,'client',?,'2099-01-01')",
        id,
        ws,
        client,
        `${id}@example.com`,
        id,
      );
    const foreignMember = one(
      t.raw,
      'SELECT id FROM workspace_memberships WHERE workspace_id=?',
      t.otherWs,
    ).id;
    const item = parent === 'item' ? 'foreign_step' : t.item('agreement').id;
    const actor = parent === 'actor' ? foreignMember : t.admin.membershipId;
    const client = parent === 'client' ? 'foreign' : 'james';
    const contact = parent === 'contact' ? 'foreign-contact' : 'james-contact';
    const invitation = parent === 'invitation' ? 'foreign-invite' : 'james-invite';
    let statement, args;
    if (relation === 'provenance') {
      const source = one(
        t.raw,
        'SELECT id FROM template_versions WHERE workspace_id=?',
        parent === 'version' ? t.otherWs : t.ws,
      ).id;
      statement =
        'INSERT INTO onboarding_instance_templates(workspace_id,onboarding_instance_id,template_version_id) VALUES(?,?,?)';
      args = [t.ws, parent === 'instance' ? 'foreign_step-instance' : 'james-run', source];
    } else if (relation === 'activation') {
      statement =
        'INSERT INTO client_activations(workspace_id,client_id,onboarding_instance_id,contact_id,recipient_email,invitee_name,actor_membership_id,invitation_id) VALUES(?,?,?,?,?,?,?,?)';
      args = [
        t.ws,
        client,
        parent === 'instance' ? 'foreign_step-instance' : 'james-run',
        contact,
        'james@example.com',
        'James',
        actor,
        invitation,
      ];
    } else if (relation === 'association') {
      statement =
        'INSERT INTO client_invitation_contacts(workspace_id,client_id,contact_id,invitation_id) VALUES(?,?,?,?)';
      args = [t.ws, client, contact, invitation];
    } else if (relation === 'submission') {
      statement =
        'INSERT INTO onboarding_item_submissions(workspace_id,onboarding_item_id,submitted_by_membership_id,submitted_at) VALUES(?,?,?,?)';
      args = [t.ws, item, actor, new Date().toISOString()];
    } else {
      statement =
        'INSERT INTO onboarding_item_resolutions(workspace_id,onboarding_item_id,resolved_by_membership_id,resolved_at,reason) VALUES(?,?,?,?,?)';
      args = [t.ws, item, actor, new Date().toISOString(), 'Valid reason'];
    }
    assert.throws(() => run(t.raw, statement, ...args), /FOREIGN KEY/);
    assert.deepEqual(all(t.raw, 'PRAGMA foreign_key_check'), []);
  });
test('fresh migrated domain has exactly Release A tables, valid FKs, and immutable significant events', async () => {
  const t = await setup();
  assert.deepEqual(
    all(t.raw, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .map((r) => r.name)
      .sort(),
    BLOOMOPS_TABLES.map(getTableName).sort(),
  );
  assert.deepEqual(all(t.raw, 'PRAGMA foreign_key_check'), []);
  for (const type of ['CLIENT_ACTIVATED', 'ONBOARDING_STARTED', 'CLIENT_INVITED', 'INVITATION_ACCEPTED']) {
    const e = one(t.raw, 'SELECT * FROM activity_events WHERE event_type=?', type);
    assert.ok(e, type);
    assert.equal(e.workspace_id, t.ws);
    assert.equal(e.client_id, 'lawrence');
    assert.throws(
      () => run(t.raw, 'UPDATE activity_events SET metadata_json=? WHERE id=?', '{}', e.id),
      /immutable/i,
    );
    assert.throws(() => run(t.raw, 'DELETE FROM activity_events WHERE id=?', e.id), /immutable/i);
  }
  assert.equal(
    one(
      t.raw,
      'SELECT count(*) n FROM activity_events a JOIN workspace_memberships m ON m.id=a.actor_membership_id WHERE a.workspace_id<>m.workspace_id OR (a.actor_user_id IS NOT NULL AND a.actor_user_id<>m.user_id)',
    ).n,
    0,
  );
});
test('unknown and prototype authorization actions cannot acquire permissions', async () => {
  const t = await setup();
  for (const actor of [t.owner, t.admin, t.client])
    for (const action of [
      'constructor',
      '__proto__',
      'toString',
      'onboarding.delete',
      'onboarding.self_verify',
      'unknown',
    ]) {
      assert.equal(evaluate(actor, { action }).allowed, false);
    }
});

for (const scope of ['workspace', 'assigned'])
  test(`200-client ${scope} list stays within the actual D1 parameter limit and scope`, async () => {
    const t = await setup();
    await t.person('many-clients', 'team_member');
    for (let n = 0; n < 205; n++) {
      const id = `page-${String(n).padStart(3, '0')}`;
      t.addClient(id);
      run(
        t.raw,
        'INSERT INTO client_contacts(id,workspace_id,client_id,name,is_primary) VALUES(?,?,?,?,1)',
        `contact-${id}`,
        t.ws,
        id,
        `Contact ${id}`,
      );
      run(
        t.raw,
        'INSERT INTO client_assignments(id,workspace_id,client_id,membership_id) VALUES(?,?,?,?)',
        `assignment-${id}`,
        t.ws,
        id,
        'many-clients-member',
      );
    }
    const actor = scope === 'workspace' ? t.owner : await t.actor('many-clients@example.com');
    // Actual workerd/D1 reproduced the 100-bound-variable ceiling. SQLite
    // accepts more, so assert that ceiling without replacing query execution.
    const prepare = t.d1.prepare.bind(t.d1);
    t.d1.prepare = (query) => {
      const stmt = prepare(query),
        bind = stmt.bind.bind(stmt);
      stmt.bind = (...values) => {
        assert.ok(values.length <= 100, 'D1 bound-variable limit');
        return bind(...values);
      };
      return stmt;
    };
    const { listClients } = await import('../lib/bloomops/clients.mjs');
    const result = await listClients(t.db, actor);
    assert.equal(result.clients.length, 200);
    assert.equal(result.total, scope === 'workspace' ? 207 : 205);
    assert.ok(
      result.clients.every((c) => c.id !== 'foreign' && (scope === 'workspace' || c.id.startsWith('page-'))),
    );
    for (const c of result.clients.filter((c) => c.id.startsWith('page-')))
      assert.equal(c.primaryContact.name, `Contact ${c.id}`);
  });
