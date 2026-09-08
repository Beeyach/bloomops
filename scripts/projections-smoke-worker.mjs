// Test-only entry bundled by projections-smoke-local; never deployed.
import assert from 'node:assert/strict';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../lib/bloomops/schema.mjs';
import { loadActor } from '../lib/bloomops/authorization.mjs';
import { listActions } from '../lib/bloomops/actions.mjs';
import { homeProjection, listProjectSummaries, HOME_ACTION_VIEWS } from '../lib/bloomops/work-projections.mjs';

export default { async fetch(request, env) {
  if (env.B6_DISPOSABLE !== 'local-only' || new URL(request.url).hostname !== 'localhost') return new Response(null, { status: 403 });
  const messages = [], check = (name, condition) => { assert.ok(condition, name); messages.push(name); };
  try {
    const run = (query, ...args) => env.DB.prepare(query).bind(...args).run();
    const all = async (query, ...args) => (await env.DB.prepare(query).bind(...args).all()).results;
    const one = (query, ...args) => env.DB.prepare(query).bind(...args).first();
    for (const migration of B6_MIGRATIONS) await run(migration);
    const insert = (table, row) => env.DB.prepare(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(() => '?').join(',')})`).bind(...Object.values(row));
    for (const ws of ['a', 'b']) await run('INSERT INTO workspaces(id,name,slug) VALUES(?,?,?)', ws, ws, ws);
    for (const [id, role, ws] of [['owner','owner','a'], ['pm','project_manager','a'], ['team','team_member','a'], ['action-only','team_member','a'], ['client','client','a'], ['foreign','owner','b']]) {
      await run('INSERT INTO user(id,name,email) VALUES(?,?,?)', id, id, `${id}@example.com`);
      await run("INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(?,?,?,?,'active')", `m-${id}`, ws, id, role);
    }
    for (const [id, ws] of [['james','a'], ['other','a'], ['foreign','b']]) await run('INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES(?,?,?,?)', id, ws, id, id);
    await run("INSERT INTO client_contacts(workspace_id,client_id,name,user_id) VALUES('a','james','James','client')");
    for (const id of ['social','systems']) {
      await run("INSERT INTO departments(id,workspace_id,name,slug) VALUES(?,'a',?,?)", id, id, id);
      await run("INSERT INTO service_types(id,workspace_id,name,slug,department_id) VALUES(?,'a',?,?,?)", id, id, id, id);
      await run("INSERT INTO service_engagements(id,workspace_id,client_id,service_type_id) VALUES(?,'a','james',?)", id, id);
    }
    const now = new Date('2026-09-09T00:30:00.000Z'), iso = now.toISOString();
    for (let i=0; i<240; i++) {
      const id = `p-${String(i).padStart(3,'0')}`, service = i % 2 ? 'social' : 'systems';
      await env.DB.batch([
        insert('projects', { id, workspace_id:'a', client_id:'james', service_engagement_id:service, name:id, health:'at_risk', visibility:'client' }),
        insert('project_assignments', { workspace_id:'a', project_id:id, membership_id:'m-team' }),
        insert('milestones', { id:`m-${id}`, workspace_id:'a', project_id:id, creation_request_id:crypto.randomUUID(), name:`Milestone ${id}`, position:0, status:'completed', completed_at:iso }),
        insert('actions', { id:`a-${id}`, workspace_id:'a', project_id:id, creation_request_id:crypto.randomUUID(), title:`Action ${id}`, due_date:'2026-09-08' }),
        insert('deliverables', { id:`d-${id}`, workspace_id:'a', project_id:id, creation_request_id:crypto.randomUUID(), title:`Deliverable ${id}`, status:'client_review' }),
        insert('assets', { id:`f-${id}`, workspace_id:'a', creation_request_id:crypto.randomUUID(), filename:`File ${id}.txt`, mime_type:'text/plain', byte_size:10, sha256:'a'.repeat(64), uploader_membership_id:'m-owner', initial_visibility:'internal', visibility:'internal', object_key:`DO_NOT_EXPOSE_${id}`, status:'ready', ready_at:iso, etag:`etag-${id}` }),
        insert('asset_links', { asset_id:`f-${id}`, workspace_id:'a', project_id:id, deliverable_id:`d-${id}` }),
        insert('activity_events', { id:`event-${id}`, workspace_id:'a', client_id:'james', service_engagement_id:service, subject_type:'file', subject_id:`f-${id}`, event_type:'FILE_UPLOADED', occurred_at:iso, metadata_json:JSON.stringify({ filename:'HISTORICAL_SECRET' }) }),
      ]);
    }
    await run("INSERT INTO projects(id,workspace_id,client_id,name,health) VALUES('foreign','b','foreign','FOREIGN_SECRET','at_risk')");
    await run("UPDATE actions SET assignee_membership_id='m-action-only' WHERE id='a-p-000'");
    const queries = [];
    const db = drizzle(env.DB, { schema, logger: { logQuery(query, params) {
      queries.push({ bindings:params.length, sqlBytes:Buffer.byteLength(query) });
      assert.ok(params.length <= 100 && Buffer.byteLength(query) <= 100000, 'D1 statement limits');
      assert.doesNotMatch(query, /^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER)\b/i);
    } } });
    const actor = async id => {
      const m = await one('SELECT * FROM workspace_memberships WHERE user_id=?', id);
      return loadActor(db, { workspace:{ id:m.workspace_id }, membership:{ id:m.id, userId:id, role:m.role, status:m.status } });
    };
    const home = who => homeProjection(db, who, { now });
    const summary = async who => (await listProjectSummaries(db, who, { projectId:'p-000', now })).items[0];
    const snapshot = async () => JSON.stringify(await Promise.all(['projects','milestones','actions','action_dependencies','deliverables','assets','asset_links','asset_upload_attempts','activity_events','bloomops_clients','service_engagements','onboarding_instances','onboarding_items'].map(table => all(`SELECT * FROM ${table} ORDER BY rowid`))));
    const team = await actor('team'), owner = await actor('owner'), pm = await actor('pm'), actionOnly = await actor('action-only');
    const before = await snapshot(); queries.length = 0;
    const dashboard = await home(team), homeQueries = queries.length;
    check('240 live Project assignments fit actual D1 with bounded Home lists', dashboard.projects.items.length===5 && dashboard.projects.hasMore && dashboard.actions.overdue.items.length===4 && dashboard.actions.overdue.hasMore && dashboard.deliverables.items.length===6 && dashboard.deliverables.hasMore && dashboard.recent.items.length===6 && dashboard.recent.hasMore);
    check('Home issues at most sixteen metadata queries without any R2 binding', homeQueries<=16 && !env.FILES);
    const work = await listProjectSummaries(db, team, { now });
    check('Work returns 200 visible rows plus an overflow signal', work.items.length===200 && work.hasMore);
    check('all Work counts are correlated to their canonical Project', work.items.every(row => row.milestones.finished===1 && row.milestones.total===1 && row.milestones.percentage===100 && row.actions.open===1 && row.actions.overdue===1 && row.deliverables.clientReview===1 && row.readyFiles===1));
    for (const who of [owner, pm, team, actionOnly]) {
      const result = await home(who);
      for (const view of HOME_ACTION_VIEWS) {
        const canonical = await listActions(db, who, { view }, { now });
        check(`${who.role}/${who.membershipId} ${view} is the exact canonical Work prefix`, JSON.stringify(result.actions[view].items)===JSON.stringify(canonical.items.slice(0,4)));
      }
    }
    const narrow = await home(actionOnly);
    check('Action-only scope contains one Action and no Project/output summaries', narrow.actions.overdue.items.length===1 && narrow.projects.items.length===0 && narrow.deliverables.items.length===0 && narrow.recent.items.length===0 && !JSON.stringify(narrow).includes('File p-000'));
    check('reads preserve all lifecycle facts and activity rows', await snapshot()===before);
    check('dashboard DTOs omit storage authority and historical metadata', !/DO_NOT_EXPOSE|HISTORICAL_SECRET|sha256|objectKey|uploaderMembershipId/.test(JSON.stringify(dashboard)));
    check('cross-workspace and guessed Project IDs return empty summaries', !(await listProjectSummaries(db, owner, { projectId:'foreign', now })).items.length && !(await listProjectSummaries(db, owner, { projectId:'missing', now })).items.length);
    check('Client actors receive no internal dashboard sections', Object.values((await home(await actor('client'))).actions).every(section=>!section.items.length) && !(await listProjectSummaries(db, await actor('client'), { now })).items.length);
    // Existing Project assignments intentionally permit restricted children.
    // PM has no assignment; its visible aggregate must shrink independently.
    for (const [table, id, field] of [['milestones','m-p-000','milestones'], ['actions','a-p-000','actions'], ['deliverables','d-p-000','deliverables'], ['assets','f-p-000','readyFiles']]) {
      await run(`UPDATE ${table} SET visibility='restricted' WHERE id=?`, id);
      const visible = await summary(pm);
      check(`restricted ${table} disappears from PM visible totals`, field==='milestones' ? visible.milestones===null : field==='actions' ? visible.actions.open===0 : field==='deliverables' ? visible.deliverables.total===0 && visible.readyFiles===0 : visible.readyFiles===0);
      await run(`UPDATE ${table} SET visibility='internal' WHERE id=?`, id);
    }
    check('recent output uses current File titles instead of event metadata', JSON.stringify(await home(pm)).includes('File p-239.txt'));
    await run("UPDATE assets SET visibility='restricted' WHERE id='f-p-239'");
    check('visibility revocation removes the current and historical recent name', !JSON.stringify(await home(pm)).includes('File p-239.txt'));
    await run("DELETE FROM project_assignments WHERE membership_id='m-team'");
    const revoked = await home(team);
    check('stale Team assignment removal revokes every Home section', !revoked.projects.items.length && !revoked.deliverables.items.length && !revoked.recent.items.length && Object.values(revoked.actions).every(s=>!s.items.length));
    await run("UPDATE workspace_memberships SET status='suspended' WHERE id='m-owner'");
    const suspended = await home(owner);
    check('stale suspended Owner cannot read dashboard data', !suspended.projects.items.length && !suspended.deliverables.items.length && !suspended.recent.items.length && Object.values(suspended.actions).every(s=>!s.items.length));
    check('D1 integrity and foreign keys remain valid', (await all('PRAGMA foreign_key_check')).length===0 && (await one('PRAGMA quick_check')).quick_check==='ok');
    return Response.json({ checks:messages.length, messages, metrics:{ assignments:240, homeQueries, maxBindings:Math.max(...queries.map(q=>q.bindings)), maxSqlBytes:Math.max(...queries.map(q=>q.sqlBytes)) } });
  } catch (error) { return Response.json({ messages, error:String(error.stack || error) }, { status:500 }); }
} };
