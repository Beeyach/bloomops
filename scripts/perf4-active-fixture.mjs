// Synthetic fixture shape from navigation-perf-fixture.mjs / server-timing-overhead.mjs.
// Returns seed statements only to the local harness, never to diagnostics/evidence.
import { randomUUID } from 'node:crypto';
export function activeFixture(scale) {
  const clientCount = scale === 'stress' ? 150 : 50;
const lit = value => value == null ? 'NULL' : typeof value === 'number' ? String(value) : "'" + String(value).replaceAll("'", "''") + "'";
const statements = [], insert = (table, row) => statements.push(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.values(row).map(lit).join(',')});`);
const ws = `PF4_PRIVATE_WORKSPACE_${scale}`, members = {}, clients = [], projects = [], content = [];
insert('workspaces', { id: ws, name: ws, slug: ws });
for (const role of ['owner', 'admin', 'project_manager', 'team_member', 'client']) {
  const id = `${ws}-${role}`, membership = `m-${id}`, email = `${id.toLowerCase()}@example.com`;
  members[role] = { id, membership, email };
  insert('user', { id, name: role, email, email_verified: 1 });
  insert('workspace_memberships', { id: membership, workspace_id: ws, user_id: id, role, status: 'active' });
}
for (const dept of ['systems', 'social']) {
  insert('departments', { id: `${ws}-${dept}`, workspace_id: ws, name: dept, slug: dept });
  insert('service_types', { id: `${ws}-type-${dept}`, workspace_id: ws, name: dept, slug: dept, department_id: `${ws}-${dept}` });
}
for (let i = 0; i < clientCount; i++) {
  const client = `${ws}-client-${i}`; clients.push(client);
  insert('bloomops_clients', { id: client, workspace_id: ws, name: `Client ${String(i).padStart(2,'0')}`, slug: `client-${i}`, timezone: i % 2 ? 'America/Los_Angeles' : 'Etc/UTC' });
  insert('client_contacts', { workspace_id: ws, client_id: client, name: `Contact ${i}`, is_primary: 1, user_id: i === 0 ? members.client.id : null });
  for (const dept of ['systems', 'social']) {
    const service = `${client}-${dept}`, project = `${service}-project`; projects.push(project);
    insert('service_engagements', { id: service, workspace_id: ws, client_id: client, service_type_id: `${ws}-type-${dept}` });
    insert('projects', { id: project, workspace_id: ws, client_id: client, service_engagement_id: service, name: `${dept} project ${String(i).padStart(2,'0')}`, visibility: 'client', health: 'at_risk' });
    insert('project_assignments', { workspace_id: ws, project_id: project, membership_id: members.team_member.membership });
    for (let j = 0; j < 3; j++) {
      insert('milestones', { workspace_id: ws, project_id: project, creation_request_id: randomUUID(), name: `Milestone ${j}`, position: j, visibility: 'client' });
      insert('deliverables', { workspace_id: ws, project_id: project, creation_request_id: randomUUID(), title: `Deliverable ${j}`, status: 'client_review', visibility: 'client' });
    }
    for (let j = 0; j < 10; j++) insert('actions', { workspace_id: ws, project_id: project, creation_request_id: randomUUID(), title: `Action ${j}`, assignee_membership_id: members.owner.membership, due_date: '2026-09-09' });
    for (let j = 0; j < 2; j++) {
      const id = `${project}-file-${j}`;
      insert('assets', { id, workspace_id: ws, creation_request_id: randomUUID(), filename: `Brief ${j}.pdf`, mime_type: 'application/pdf',
        byte_size: 1024, sha256: '0'.repeat(64), uploader_membership_id: members.owner.membership, initial_visibility: 'internal',
        visibility: 'internal', status: 'ready', object_key: `synthetic-perf2/${id}`, etag: 'synthetic-metadata-only', ready_at: new Date().toISOString() });
      insert('asset_links', { asset_id: id, workspace_id: ws, project_id: project });
    }
    if (dept === 'social') for (let j = 0; j < 5; j++) {
      const id = `${service}-content-${j}`; content.push(id);
      insert('content_items', { id, workspace_id: ws, client_id: client, service_engagement_id: service, creation_request_id: randomUUID(), title: `Content ${i}-${j}`, type: 'reel', visibility: 'client' });
    }
  }
}

  return { statements, ws, members, counts: { clients:clientCount, projects:clientCount*2,
    milestones:clientCount*6, actions:clientCount*20, deliverables:clientCount*6,
    content:clientCount*5, files:clientCount*4, projectAssignments:clientCount*2 } };
}
