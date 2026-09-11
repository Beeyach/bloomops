// Test-only entry bundled by systems-smoke-local; never deployed.
import assert from 'node:assert/strict';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../lib/bloomops/schema.mjs';
import { loadActor } from '../lib/bloomops/authorization.mjs';
import { systemsProjection } from '../lib/bloomops/systems.mjs';

export default { async fetch(request, env) {
  if (env.D1_SYSTEMS_DISPOSABLE !== 'local-only' || new URL(request.url).hostname !== 'localhost') return new Response(null, { status: 403 });
  const messages = [], check = (name, condition) => { assert.ok(condition, name); messages.push(name); };
  try {
    const run = (query, ...args) => env.DB.prepare(query).bind(...args).run();
    const all = async (query, ...args) => (await env.DB.prepare(query).bind(...args).all()).results;
    const one = (query, ...args) => env.DB.prepare(query).bind(...args).first();
    for (const migration of D1_SYSTEMS_MIGRATIONS) await run(migration);
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
    let batches = 0;
    const binding = new Proxy(env.DB, { get(target, key) {
      if (key === 'batch') return statements => { batches++; return target.batch(statements); };
      const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
    } });
    const db = drizzle(binding, { schema, logger: { logQuery(query, params) {
      queries.push({ bindings:params.length, sqlBytes:Buffer.byteLength(query) });
      assert.ok(params.length <= 100 && Buffer.byteLength(query) <= 100000, 'D1 statement limits');
      assert.doesNotMatch(query, /^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER)\b/i);
    } } });
    const actor = async id => {
      const m = await one('SELECT * FROM workspace_memberships WHERE user_id=?', id);
      return loadActor(db, { workspace:{ id:m.workspace_id }, membership:{ id:m.id, userId:id, role:m.role, status:m.status } });
    };
    const team=await actor('team'), owner=await actor('owner'), pm=await actor('pm'), actionOnly=await actor('action-only');
    const read=(who=owner, filters={})=>systemsProjection(db,who,filters,{now});
    const snapshot=async()=>JSON.stringify(await Promise.all(['projects','milestones','actions','deliverables','assets','asset_links','activity_events','service_engagements'].map(table=>all(`SELECT * FROM ${table} ORDER BY rowid`))));
    const before=await snapshot(); queries.length=0; batches=0;
    const first=await read(team), queryCount=queries.length, batchCount=batches;
    check('240 assignments yield 50 current Systems Projects and a readable overflow',first.projects.items.length===50&&first.projects.hasMore);
    check('all Projects follow current Systems engagement truth',first.projects.items.every(p=>Number(p.id.slice(2))%2===0));
    check('correlated child summaries reuse all Work Core permissions',first.projects.items.every(p=>p.milestones.total===1&&p.milestones.finished===1&&p.actions.open===1&&p.deliverables.clientReview===1&&p.readyFiles===1));
    check('Systems issues five metadata statements in one native D1 batch without R2',queryCount===5&&batchCount===1&&!env.FILES);
    await run("UPDATE bloomops_clients SET timezone='US/Pacific' WHERE id='james'");
    queries.length=0;batches=0;
    const alias=await read(team);
    check('a valid legacy timezone alias falls back to one additional exact authorized batch',alias.projects.items.length===50&&batches===2);
    await run("UPDATE bloomops_clients SET timezone=NULL WHERE id='james'");
    const second=await read(team,{page:'2'}),third=await read(team,{page:'3'});
    check('all 120 Systems Projects are reachable in deterministic pages',second.projects.items.length===50&&third.projects.items.length===20&&!third.projects.hasMore&&new Set([...first.projects.items,...second.projects.items,...third.projects.items].map(p=>p.id)).size===120);
    check('bounded delivery and facet options exclude non-Systems Services',first.deliverables.items.length===6&&first.deliverables.hasMore&&first.options.services.items.length===1&&first.options.services.items[0].id==='systems');
    check('reads do not mutate canonical lifecycle or history',await snapshot()===before);
    check('storage authority and historical metadata never serialize',!/DO_NOT_EXPOSE|HISTORICAL_SECRET|sha256|objectKey|uploaderMembershipId/.test(JSON.stringify(first)));
    for(const who of [owner,pm]) check(`${who.role} sees current Systems work`,(await read(who)).projects.items.length===50);
    const narrow=await read(actionOnly);
    check('Action-only scope gives no parent rows, facets or outputs',!narrow.projects.items.length&&!narrow.options.clients.items.length&&!narrow.options.services.items.length&&!narrow.deliverables.items.length);
    check('Client actors cannot use internal Systems read model',!(await read(await actor('client'))).ok);
    check('foreign actor sees no local Systems Projects',!(await read(await actor('foreign'))).projects.items.length);
    for(const filters of [{clientId:'foreign'},{serviceEngagementId:'social'},{serviceEngagementId:'missing'},{page:'0'}]) check('foreign/non-Systems/invalid filters fail safely',!(await read(owner,filters)).ok);
    for(const table of ['milestones','actions','deliverables','assets']) {
      await run(`UPDATE ${table} SET visibility='restricted' WHERE id=?`,{milestones:'m-p-000',actions:'a-p-000',deliverables:'d-p-000',assets:'f-p-000'}[table]);
    }
    const restricted=(await read(pm)).projects.items.find(p=>p.id==='p-000');
    check('PM restricted children cannot affect progress, Action/Deliverable/File totals',restricted.milestones===null&&restricted.actions.open===0&&restricted.deliverables.total===0&&restricted.readyFiles===0);
    check('Project assignment retains its canonical restricted-child access',(await read(team)).projects.items[0].readyFiles===1);
    await run("UPDATE service_types SET name='Renamed',department_id='social' WHERE id='systems'");
    const moved=await read(owner);
    check('department reassignment removes rows, facets and outputs immediately',!moved.projects.items.length&&!moved.options.services.items.length&&!moved.deliverables.items.length);
    await run("UPDATE service_types SET department_id='systems' WHERE id='systems'");
    await run("DELETE FROM project_assignments WHERE membership_id='m-team'");
    check('issued actor loses all Systems work after Project unassignment',!(await read(team)).projects.items.length);
    await run("UPDATE workspace_memberships SET status='suspended' WHERE id='m-owner'");
    const suspended=await read(owner);
    check('suspension revokes current rows, filters and output',!suspended.projects.items.length&&!suspended.options.clients.items.length&&!suspended.deliverables.items.length);
    check('D1 integrity and foreign keys remain valid',(await all('PRAGMA foreign_key_check')).length===0&&(await one('PRAGMA quick_check')).quick_check==='ok');
    return Response.json({ checks:messages.length,messages,metrics:{assignments:240,queryCount,batchCount,maxBindings:Math.max(...queries.map(q=>q.bindings)),maxSqlBytes:Math.max(...queries.map(q=>q.sqlBytes))} });
  } catch(error) { return Response.json({messages,error:String(error.stack||error)},{status:500}); }
} };
