// Test-only entry bundled by release-b-smoke-local. Never part of the app Worker.
import assert from 'node:assert/strict';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../lib/bloomops/schema.mjs';
import { loadActor } from '../lib/bloomops/authorization.mjs';
import { createClient } from '../lib/bloomops/clients.mjs';
import { createServiceEngagement } from '../lib/bloomops/services.mjs';
import { onboardingDefaultStatements } from '../lib/bloomops/onboarding-defaults.mjs';
import { activateClient } from '../lib/bloomops/client-activation.mjs';
import { configureOnboardingItem } from '../lib/bloomops/onboarding-guidance.mjs';
import { mutateOnboardingItem } from '../lib/bloomops/onboarding-runtime.mjs';
import { homeProjection, listProjectSummaries } from '../lib/bloomops/work-projections.mjs';
import { releaseBRaces } from './release-b-races.mjs';
import { createProject } from '../lib/bloomops/projects.mjs';
import { createMilestone } from '../lib/bloomops/milestones.mjs';
import { createAction } from '../lib/bloomops/actions.mjs';
import { createDeliverable } from '../lib/bloomops/deliverables.mjs';
import { uploadFile, retryFile, getFile, listFiles, changeFile, downloadFile } from '../lib/bloomops/files.mjs';
import { FILE_LEASE_MS, FILE_MAX_BYTES } from '../lib/bloomops/file-values.mjs';
import { projectActivity } from '../lib/bloomops/project-activity.mjs';
import { clientActivity } from '../lib/bloomops/client-activity.mjs';

export default { async fetch(request, env) {
  if (env.B7_DISPOSABLE !== 'local-only' || new URL(request.url).hostname !== 'localhost') return new Response(null, { status: 403 });
  const messages = [], check = (name, condition) => { assert.ok(condition, name); messages.push(name); };
  try {
    const run = (q, ...args) => env.DB.prepare(q).bind(...args).run(), one = (q, ...args) => env.DB.prepare(q).bind(...args).first(), all = async (q, ...args) => (await env.DB.prepare(q).bind(...args).all()).results;
    for (const sql of B7_MIGRATIONS) await run(sql);
    const db = drizzle(env.DB, { schema }), bucket = env.FILES;
    check('all thirteen domain migrations apply inside workerd', (await all("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('assets','asset_links','asset_upload_attempts')")).length === 3);
    for (const ws of ['a', 'b']) await run('INSERT INTO workspaces(id,name,slug) VALUES(?,?,?)', ws, ws, ws);
    for (const [id, role, ws] of [['ellen', 'owner', 'a'], ['ary', 'admin', 'a'], ['pm', 'project_manager', 'a'], ['sam', 'team_member', 'a'], ['james', 'client', 'a'], ['lawrence', 'client', 'a'], ['foreign', 'owner', 'b']]) {
      await run('INSERT INTO user(id,name,email) VALUES(?,?,?)', id, id, `${id}@example.com`);
      await run("INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(?,?,?,?,'active')", `m-${id}`, ws, id, role);
    }
    for (const [id, ws] of [['james', 'a'], ['lawrence', 'a'], ['foreign-client', 'b']]) await run('INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES(?,?,?,?)', id, ws, id, id);
    await run("INSERT INTO client_contacts(workspace_id,client_id,name,user_id) VALUES('a','james','James','james')");
    await run("INSERT INTO departments(id,workspace_id,name,slug) VALUES('social','a','Social','social')");
    await run("INSERT INTO service_types(id,workspace_id,name,slug,department_id) VALUES('social','a','Social','social','social')");
    await run("INSERT INTO service_engagements(id,workspace_id,client_id,service_type_id) VALUES('social','a','james','social')");
    const actor = async id => { const row = await one('SELECT * FROM workspace_memberships WHERE user_id=?', id); return loadActor(db, { workspace: { id: row.workspace_id }, membership: { id: row.id, userId: id, role: row.role, status: row.status } }); };
    const owner = await actor('ellen'), pm = await actor('pm'), team = await actor('sam'), client = await actor('james');
    // Real A9/A10 operations establish the release story before Work begins.
    for (const statement of onboardingDefaultStatements({ workspaceSlug: 'a' })) await run(statement);
    await run("UPDATE client_contacts SET email='james@example.com',is_primary=1 WHERE client_id='james'");
    await run("UPDATE service_types SET slug='social-media-management' WHERE id='social'");
    await run("INSERT INTO departments(id,workspace_id,name,slug) VALUES('systems','a','Systems','systems')");
    await run("INSERT INTO service_types(id,workspace_id,name,slug,department_id) VALUES('ghl','a','GHL','ghl','systems')");
    const systems = await createServiceEngagement(db, { workspaceId: 'a', clientId: 'james', input: { serviceTypeId: 'ghl' }, actorMembershipId: owner.membershipId });
    check('same Client purchases a second independent Service', systems.ok);
    const mail = [];
    const activated = await activateClient(db, { actor: owner, clientId: 'james', appUrl: 'http://localhost', workspaceName: 'B7', mailer: { send: async message => mail.push(message) } });
    check('canonical activation snapshots Common Social and GHL with local-only mail', activated.ok && mail.length === 1 && (await one("SELECT count(*) n FROM onboarding_instance_templates")).n === 3);
    const requirements = await all("SELECT * FROM onboarding_items WHERE workspace_id='a' AND required=1");
    for (const item of requirements) {
      assert.ok((await configureOnboardingItem(db, { actor: owner, clientId: 'james', itemId: item.id, input: { revision: 0, actionType: 'confirmation', actionUrl: null, instructions: item.instructions || 'Complete the agreed external work.' } })).ok);
      assert.ok((await mutateOnboardingItem(db, { actor: client, clientId: 'james', itemId: item.id, operation: 'submit', guidanceRevision: 1 })).ok);
      if (item.verification_required) assert.ok((await mutateOnboardingItem(db, { actor: owner, clientId: 'james', itemId: item.id, operation: 'verify' })).ok);
    }
    check('real Client submissions and agency verification finish onboarding and activate relationship', requirements.length === 6 && (await one("SELECT relationship_status FROM bloomops_clients WHERE id='james'")).relationship_status === 'active' && (await one("SELECT status FROM onboarding_instances WHERE client_id='james'")).status === 'complete');
    check('canonical Client-level Project creation succeeds', (await createProject(db, { actor: owner, clientId: 'james', input: { name: 'Client-level strategy', visibility: 'client' } })).ok);
    check('canonical service-specific Project creation succeeds', (await createProject(db, { actor: owner, clientId: 'james', input: { name: 'Systems launch', serviceEngagementId: systems.serviceEngagementId, visibility: 'client' } })).ok);
    for (let index = 0; index < 8; index++) {
      const made = await createClient(db, { workspaceId: 'a', actorMembershipId: owner.membershipId, input: { name: `Studio ${index}`, contactName: `Contact ${index}`, contactEmail: `studio-${index}@example.com` } });
      assert.ok(made.ok, JSON.stringify(made));
      assert.ok((await createProject(db, { actor: owner, clientId: made.clientId, input: { name: `Independent launch ${index}`, health: 'needs_attention' } })).ok);
    }
    check('realistic operating fixture has ten independent Clients', (await one("SELECT count(*) n FROM bloomops_clients WHERE workspace_id='a'")).n === 10);
    const projectId = (await createProject(db, { actor: owner, clientId: 'james', input: { name: 'Launch', serviceEngagementId: 'social', visibility: 'client' } })).projectId;
    const milestoneId = (await createMilestone(db, { actor: owner, projectId, requestId: crypto.randomUUID(), input: { name: 'Prepare' } })).milestoneId;
    await createAction(db, { actor: owner, projectId, requestId: crypto.randomUUID(), input: { title: 'Build', milestoneId, assigneeMembershipId: 'm-sam' } });
    const deliverableId = (await createDeliverable(db, { actor: owner, projectId, requestId: crypto.randomUUID(), input: { title: 'PRIVATE_DELIVERABLE', clientLabel: 'Your website', visibility: 'client' } })).deliverableId;
    const bytes = new TextEncoder().encode('Real R2 handoff'), input = extra => ({ requestId: crypto.randomUUID(), filename: 'handoff.txt', mimeType: 'text/plain', byteSize: bytes.length, ...extra });
    const upload = (value = {}, extra = {}) => uploadFile(db, { actor: owner, bucket, projectId, input: input(value), bytes, ...extra });
    const get = id => getFile(db, owner, id), stored = id => one('SELECT * FROM assets WHERE id=?', id);
    const download = (fileId, who = owner, extra = {}) => downloadFile(db, { bucket, actor: who, fileId, ...extra });
    const edit = async (fileId, operation, extra = {}) => changeFile(db, { actor: owner, bucket, fileId, operation, expectedRevision: (await get(fileId)).revision, ...extra });
    const retry = (fileId, extra = {}) => retryFile(db, { bucket, actor: owner, fileId, input: { filename: 'handoff.txt', mimeType: 'text/plain', byteSize: bytes.length }, bytes, ...extra });
    const eventCount = async type => (await one("SELECT count(*) n FROM activity_events WHERE subject_type='file' AND event_type=?", type)).n;
    const parents = async () => JSON.stringify(await Promise.all(['projects', 'milestones', 'actions', 'deliverables', 'bloomops_clients', 'service_engagements', 'onboarding_instances'].map(table => all(`SELECT * FROM ${table} ORDER BY rowid`))));
    const beforeParents = await parents(), requestId = crypto.randomUUID();
    const r = await upload({ requestId, visibility: 'client', deliverableId }); check('Project Deliverable upload becomes Ready with one event', r.ok && (await get(r.fileId)).status === 'ready' && await eventCount('FILE_UPLOADED') === 1);
    const row = await stored(r.fileId), object = await bucket.head(row.object_key);
    check('R2 head confirms size, MIME, etag and SHA-256 after put', object.size === bytes.length && object.httpMetadata.contentType === 'text/plain' && object.etag === row.etag && Buffer.from(object.checksums.sha256).toString('hex') === row.sha256);
    check('real authenticated byte path returns exact original bytes', await new Response((await download(r.fileId, client)).body).text() === 'Real R2 handoff');
    check('original filename never determines workspace-separated object key', row.object_key.startsWith('bloomops-files/a/') && !row.object_key.includes('handoff'));
    const originalReadyAt = row.ready_at, again = await upload({ requestId, visibility: 'client', deliverableId });
    check('response-loss retry keeps identity, key, timestamp, one R2 object and event', again.unchanged && again.fileId === r.fileId && (await stored(r.fileId)).ready_at === originalReadyAt && (await bucket.list()).objects.length === 1 && await eventCount('FILE_UPLOADED') === 1);
    check('incompatible retry cannot overwrite the object', (await upload({ requestId, visibility: 'client', deliverableId }, { bytes: new Uint8Array(bytes.length) })).reason === 'conflict');
    const shared = await listFiles(db, client, projectId, { portal: true }); check('portal returns exact safe metadata and attachment label', shared.items.length === 1 && Object.keys(shared.items[0]).sort().join(',') === 'attachmentLabel,byteSize,filename,id,mimeType,readyAt' && shared.items[0].attachmentLabel === 'Your website' && !JSON.stringify(shared).includes('PRIVATE'));
    check('Action-only assignment cannot read Files or bytes', (await listFiles(db, team, projectId)).items.length === 0 && await download(r.fileId, team) === null);
    for (const who of ['foreign', 'lawrence']) check(`${who} cannot guess File metadata or bytes`, await getFile(db, await actor(who), r.fileId, { portal: who === 'lawrence' }) === null && await download(r.fileId, await actor(who)) === null);
    const restricted = await upload({ filename: 'restricted-note.txt', visibility: 'restricted' });
    check('ordinary PM and Client cannot read restricted Files', await getFile(db, pm, restricted.fileId) === null && await download(restricted.fileId, client) === null);
    await run("INSERT INTO project_assignments(workspace_id,project_id,membership_id) VALUES('a',?,'m-pm')", projectId);
    check('Project assignment permits restricted PM coordination', (await edit(restricted.fileId, 'visibility', { actor: await actor('pm'), visibility: 'internal' })).ok);
    await run("DELETE FROM project_assignments WHERE membership_id='m-pm'");
    await run("INSERT INTO client_assignments(workspace_id,client_id,membership_id) VALUES('a','james','m-sam')");
    check('combined Team Project and Client histories fit D1 bind limits', JSON.stringify(await projectActivity(db, team, projectId)).includes('handoff') && JSON.stringify(await clientActivity(db, 'a', 'james', { actor: team })).includes('handoff'));
    await edit(r.fileId, 'visibility', { visibility: 'restricted' });
    check('restriction removes historical file labels and current Client rows', !(await listFiles(db, client, projectId, { portal: true })).items.length && !JSON.stringify(await projectActivity(db, team, projectId)).includes('handoff.txt') && !JSON.stringify(await clientActivity(db, 'a', 'james', { actor: team })).includes('handoff.txt'));
    await edit(r.fileId, 'visibility', { visibility: 'client' });
    await run("DELETE FROM client_assignments WHERE membership_id='m-sam'");
    check('stale Team loses byte access after assignment removal', await download(r.fileId, team) === null);
    const wrap = overrides => ({ put: (...args) => bucket.put(...args), get: (...args) => bucket.get(...args), head: (...args) => bucket.head(...args), delete: (...args) => bucket.delete(...args), ...overrides });
    for (const kind of ['project', 'deliverable', 'file', 'contact', 'membership']) {
      const query = { project: "UPDATE projects SET visibility='internal' WHERE id=?", deliverable: "UPDATE deliverables SET visibility='internal' WHERE id=?", file: "UPDATE assets SET visibility='internal' WHERE id=?", contact: "UPDATE client_contacts SET user_id=NULL WHERE user_id='james'", membership: "UPDATE workspace_memberships SET status='suspended' WHERE id='m-james'" }[kind];
      const revoke = wrap({ get: async key => { const result = await bucket.get(key); await run(query, ...['project', 'deliverable', 'file'].includes(kind) ? [kind === 'project' ? projectId : kind === 'deliverable' ? deliverableId : r.fileId] : []); return result; } });
      check(`live ${kind} revocation during R2 get prevents bytes`, await download(r.fileId, client, { bucket: revoke }) === null);
      await run("UPDATE projects SET visibility='client' WHERE id=?", projectId); await run("UPDATE deliverables SET visibility='client' WHERE id=?", deliverableId); await run("UPDATE assets SET visibility='client' WHERE id=?", r.fileId);
      await run("UPDATE client_contacts SET user_id='james' WHERE client_id='james'"); await run("UPDATE workspace_memberships SET status='active' WHERE id='m-james'");
    }
    for (const failure of ['reserve', 'finalize', 'activity', 'put', 'cleanup']) {
      const key = crypto.randomUUID();
      if (failure === 'reserve') await run("CREATE TRIGGER fail_b7 BEFORE INSERT ON assets BEGIN SELECT RAISE(ABORT,'reserve'); END");
      if (failure === 'finalize') await run("CREATE TRIGGER fail_b7 BEFORE UPDATE ON assets WHEN NEW.status='ready' BEGIN SELECT RAISE(ABORT,'finalize'); END");
      if (failure === 'activity') await run("CREATE TRIGGER fail_b7 BEFORE INSERT ON activity_events WHEN NEW.subject_type='file' BEGIN SELECT RAISE(ABORT,'activity'); END");
      const broken = ['put', 'cleanup'].includes(failure) ? wrap({ put: async (...args) => { await bucket.put(...args); throw new Error('lost put response'); }, ...(failure === 'cleanup' ? { delete: async () => { throw new Error('cleanup failed'); } } : {}) }) : bucket;
      const failed = await upload({ requestId: key }, { bucket: broken }).catch(() => ({ ok: false }));
      const file = await one('SELECT * FROM assets WHERE creation_request_id=?', key);
      check(`${failure} failure never produces Ready metadata`, !failed.ok && (failure === 'reserve' ? !file : file.status === 'failed' && file.ready_at === null && await download(file.id) === null));
      if (['reserve', 'finalize', 'activity'].includes(failure)) await run('DROP TRIGGER fail_b7');
      if (file) {
        check(`${failure} cleanup has the expected durable evidence`, (failure === 'cleanup' ? Boolean(await bucket.head(file.object_key)) : await bucket.head(file.object_key) === null) && (await one('SELECT count(*) n FROM asset_upload_attempts WHERE asset_id=?', file.id)).n === 1);
        const recovered = await retry(file.id); check(`${failure} recovery uses the same File and one fresh object`, recovered.ok && recovered.fileId === file.id && (await stored(file.id)).object_key !== file.object_key && await bucket.head(file.object_key) === null);
      }
    }
    const interrupted = await upload({}, { bucket: wrap({ put: async (...args) => { const result = await bucket.put(...args); await run("UPDATE workspace_memberships SET status='suspended' WHERE id='m-pm'"); return result; } }), actor: pm });
    check('stale PM cannot finalize after suspension during actual R2 put', !interrupted.ok); await run("UPDATE workspace_memberships SET status='active' WHERE id='m-pm'");
    const batch = db.batch.bind(db); let count = 0; db.batch = async writes => { const results = await batch(writes); if (++count === 2) throw new Error('lost finalize response'); return results; };
    const lost = await upload(); db.batch = batch;
    check('lost D1 finalize response preserves Ready bytes', lost.ok && lost.unchanged && Boolean(await download(lost.fileId)));
    const missing = await upload(), missingKey = (await stored(missing.fileId)).object_key; await bucket.delete(missingKey);
    check('missing R2 object fails safely without mutating Ready metadata', await download(missing.fileId) === null && (await stored(missing.fileId)).status === 'ready');
    const archive = await upload(), archiveKey = (await stored(archive.fileId)).object_key; await edit(archive.fileId, 'archive');
    check('archive refuses bytes while retaining the previously Ready object', await download(archive.fileId) === null && Boolean(await bucket.head(archiveKey)) && (await edit(archive.fileId, 'archive')).unchanged);
    const now = new Date(), competingKey = crypto.randomUUID(); let started, release;
    const wait = new Promise(resolve => { started = resolve; }), gate = new Promise(resolve => { release = resolve; });
    const delayed = wrap({ put: async (...args) => { started(); await gate; return bucket.put(...args); } });
    const old = upload({ requestId: competingKey }, { bucket: delayed, now }); await wait;
    const winner = await upload({ requestId: competingKey }, { now: new Date(now.getTime() + FILE_LEASE_MS + 1) }); release(); await old;
    check('late writer cannot destroy a winning real R2 recovery object', winner.ok && Boolean(await download(winner.fileId)) && (await all('SELECT * FROM asset_upload_attempts WHERE asset_id=?', winner.fileId)).length === 2);
    const max = new Uint8Array(FILE_MAX_BYTES).fill(42), maxResult = await upload({ filename: 'bounded.bin', mimeType: 'application/octet-stream', byteSize: max.length }, { bytes: max });
    check('exact 5 MiB upload is supported by actual R2 and bounded metadata', maxResult.ok && (await bucket.head((await stored(maxResult.fileId)).object_key)).size === FILE_MAX_BYTES);
    check('File operations preserve nonempty Client Service Project Milestone Action Deliverable facts', beforeParents === await parents());
    const readSnapshot = async () => JSON.stringify(await Promise.all(['projects','milestones','actions','action_dependencies','deliverables','assets','asset_links','asset_upload_attempts','activity_events','bloomops_clients','service_engagements','onboarding_instances','onboarding_items'].map(table => all(`SELECT * FROM ${table} ORDER BY rowid`))));
    const beforeReads = await readSnapshot();
    for (const who of [owner, await actor('ary'), pm]) {
      const home = await homeProjection(db, who), work = await listProjectSummaries(db, who);
      check(`${who.role} receives bounded canonical Home and complete ten-Client Work`, home.projects.items.length === 5 && home.projects.hasMore && work.items.length === 11);
    }
    check('whole-release Home/Work reads do not change any canonical row or activity', beforeReads === await readSnapshot());
    await releaseBRaces({ db, bucket, owner, team, clientId: 'james', run, one, all, check });
    check('D1 FK and integrity checks pass', (await all('PRAGMA foreign_key_check')).length === 0 && (await one('PRAGMA quick_check')).quick_check === 'ok');
    return Response.json({ checks: messages.length, messages });
  } catch (error) { return Response.json({ messages, error: String(error.stack || error) }, { status: 500 }); }
} };
