import { testDb, testAuth, run, one, all } from './_bloomops-db.mjs';
import { loadActor } from '../lib/bloomops/authorization.mjs';
import { createProject, getProject, transitionProject, updateProject } from '../lib/bloomops/projects.mjs';

export async function setup({ auth = false } = {}) {
  const t = auth ? testAuth() : testDb();
  for (const ws of ['a', 'b']) run(t.raw, 'INSERT INTO workspaces(id,name,slug) VALUES(?,?,?)', ws, `Agency ${ws}`, ws);
  for (const [id, role, ws] of [['ellen','owner','a'], ['ary','admin','a'], ['pm','project_manager','a'], ['sam','team_member','a'], ['other','team_member','a'], ['james','client','a'], ['lawrence','client','a'], ['foreign','owner','b']]) {
    run(t.raw, 'INSERT INTO user(id,name,email,email_verified) VALUES(?,?,?,1)', id, id, `${id}@example.com`);
    run(t.raw, "INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(?,?,?,?,'active')", `m-${id}`, ws, id, role);
  }
  for (const [id, ws] of [['james','a'], ['lawrence','a'], ['foreign-client','b']]) {
    run(t.raw, 'INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES(?,?,?,?)', id, ws, id, id);
    if (ws === 'a') run(t.raw, 'INSERT INTO client_contacts(id,workspace_id,client_id,name,user_id) VALUES(?,?,?,?,?)', `c-${id}`, ws, id, id, id);
  }
  for (const [id, ws] of [['social','a'], ['systems','a'], ['foreign-dept','b']]) {
    run(t.raw, 'INSERT INTO departments(id,workspace_id,name,slug) VALUES(?,?,?,?)', id, ws, id, id);
    run(t.raw, 'INSERT INTO service_types(id,workspace_id,name,slug,department_id) VALUES(?,?,?,?,?)', `type-${id}`, ws, id, id, id);
  }
  for (const [id, ws, client, type] of [['social-service','a','james','social'], ['ghl-service','a','james','systems'], ['kajabi-service','a','lawrence','systems'], ['foreign-service','b','foreign-client','foreign-dept']]) {
    run(t.raw, 'INSERT INTO service_engagements(id,workspace_id,client_id,service_type_id) VALUES(?,?,?,?)', id, ws, client, `type-${type}`);
  }
  t.actor = async (id) => {
    const member = one(t.raw, 'SELECT * FROM workspace_memberships WHERE user_id=?', id);
    return loadActor(t.db, { workspace: { id: member.workspace_id }, membership: { id: member.id, workspaceId: member.workspace_id, userId: id, role: member.role, status: member.status } });
  };
  t.owner = await t.actor('ellen');
  t.create = (input = {}, options = {}) => createProject(t.db, { actor: t.owner, clientId: 'james', input: { name: 'Launch the website', ...input }, ...options });
  t.get = (id, actor = t.owner) => getProject(t.db, actor, id);
  t.edit = async (id, input, options = {}) => updateProject(t.db, { actor: t.owner, projectId: id, input, expectedRevision: (await t.get(id)).revision, ...options });
  t.move = async (id, toStatus, options = {}) => transitionProject(t.db, { actor: t.owner, projectId: id, toStatus, expectedRevision: (await t.get(id)).revision, ...options });
  t.events = (id, type = null) => all(t.raw, 'SELECT * FROM activity_events WHERE subject_type=? AND subject_id=?' + (type ? ' AND event_type=?' : ''), 'project', id, ...type ? [type] : []);
  return t;
}
