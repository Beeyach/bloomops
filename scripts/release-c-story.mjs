// Test-only C1–C6 acceptance story, shared by node:test and disposable workerd.
// All Content state changes use the real domains. SQL seeds synthetic parent
// records and changes current assignment/contact facts; it never skips stages.
import assert from 'node:assert/strict';
import { createAuth } from '../lib/bloomops/auth.mjs';
import { getAccess, getActor } from '../lib/bloomops/access.mjs';
import { createContent, getContent, listContent, updateContent } from '../lib/bloomops/content.mjs';
import { transitionContent } from '../lib/bloomops/content-pipeline.mjs';
import { setContentPlatforms } from '../lib/bloomops/content-platforms.mjs';
import { contentCalendar } from '../lib/bloomops/content-calendar.mjs';
import { uploadContentFile, downloadContentFile, listContentFiles, recordingRequests } from '../lib/bloomops/content-files.mjs';
import { contentFileActivityRows } from '../lib/bloomops/content-file-activity.mjs';
import { requestContentApproval, respondContentApproval, contentApprovalHistory, getPortalApproval } from '../lib/bloomops/content-approvals.mjs';
import { portalContent, getPortalContent, hasPortalContent } from '../lib/bloomops/portal-content.mjs';

export async function releaseCStory({ db, d1, bucket, check }) {
  const run = (q, ...args) => d1.prepare(q).bind(...args).run();
  const one = (q, ...args) => d1.prepare(q).bind(...args).first();
  const all = async (q, ...args) => (await d1.prepare(q).bind(...args).all()).results;
  const now = new Date('2026-09-30T12:00:00.000Z');
  for (const id of ['c7-agency', 'c7-foreign']) await run('INSERT INTO workspaces(id,name,slug) VALUES(?,?,?)', id, id, id);
  for (const [id, role, workspace] of [['owner', 'owner', 'agency'], ['contractor', 'team_member', 'agency'], ['pm', 'project_manager', 'agency'],
    ['client', 'client', 'agency'], ['other', 'client', 'agency'], ['foreign', 'owner', 'foreign']]) {
    await run('INSERT INTO user(id,name,email,email_verified) VALUES(?,?,?,1)', `c7-${id}`, id, `c7-${id}@example.com`);
    await run("INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(?,?,?,?,'active')", `c7-m-${id}`, `c7-${workspace}`, `c7-${id}`, role);
  }
  for (const id of ['james', 'lawrence']) await run("INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES(?,'c7-agency',?,?)", `c7-${id}`, id, id);
  for (const [client, user] of [['james', 'client'], ['lawrence', 'other']]) {
    await run("INSERT INTO client_contacts(workspace_id,client_id,name,user_id) VALUES('c7-agency',?,?,?)", `c7-${client}`, client, `c7-${user}`);
  }
  for (const type of ['social', 'systems']) {
    await run("INSERT INTO departments(id,workspace_id,name,slug) VALUES(?,'c7-agency',?,?)", `c7-${type}`, type, type);
    await run("INSERT INTO service_types(id,workspace_id,name,slug,department_id) VALUES(?,'c7-agency',?,?,?)", `c7-${type}`, type, `custom-${type}`, `c7-${type}`);
  }
  for (const [id, client, type] of [['social-service', 'james', 'social'], ['ghl-service', 'james', 'systems'], ['other-service', 'lawrence', 'social']]) {
    await run("INSERT INTO service_engagements(id,workspace_id,client_id,service_type_id) VALUES(?,'c7-agency',?,?)", `c7-${id}`, `c7-${client}`, `c7-${type}`);
  }
  await run("INSERT INTO department_memberships(workspace_id,department_id,membership_id) VALUES('c7-agency','c7-social','c7-m-contractor')");
  const assign = service => run("INSERT INTO service_assignments(workspace_id,service_engagement_id,membership_id) VALUES('c7-agency',?,'c7-m-contractor')", service);
  await assign('c7-social-service');
  const parents = () => all("SELECT id,relationship_status AS status FROM bloomops_clients WHERE workspace_id='c7-agency' UNION ALL SELECT id,status FROM service_engagements WHERE workspace_id='c7-agency' ORDER BY id");
  const beforeParents = JSON.stringify(await parents());

  // Real issued cookies, retained throughout all revocations. Mail is captured
  // in memory; neither the fixture nor its caller needs an outbound transport.
  const base = 'http://localhost', env = { DB: d1, BLOOMOPS_ENV: 'development', BLOOMOPS_APP_URL: base,
    BLOOMOPS_AUTH_SECRET: 'c7-disposable-only-0123456789-abcdefghijklmnopqrstuvwxyz' };
  const sent = [], mailer = { ready: true, transport: 'memory', async send(mail) { sent.push(mail); } };
  const auth = createAuth({ env, db, mailer }), cookies = {};
  for (const name of ['owner', 'contractor', 'pm', 'client', 'other', 'foreign']) {
    const start = sent.length;
    const requested = await auth.handler(new Request(base + '/api/auth/sign-in/magic-link', { method: 'POST',
      headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ email: `c7-${name}@example.com`, callbackURL: '/' }) }));
    assert.equal(requested.status, 200);
    assert.equal(sent.length, start + 1);
    const verified = await auth.handler(new Request(sent[start].text.match(/https?:\/\/\S+/)[0]));
    assert.equal(verified.status, 302);
    cookies[name] = verified.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    assert.ok(cookies[name]);
  }
  const actor = async name => getActor(await getAccess(new Request(base, { headers: { cookie: cookies[name] } }), { env }));
  const owner = await actor('owner'), client = await actor('client'), contractor = await actor('contractor');
  const identity = name => auth.api.getSession({ headers: new Headers({ cookie: cookies[name] }) });
  const sessionIds = Object.fromEntries(await Promise.all(['client', 'contractor', 'pm'].map(async name => [name, (await identity(name)).session.id])));
  check('one Client has Social and Systems; contractor has only the exact Social assignment',
    (await one("SELECT count(*) n FROM service_engagements WHERE client_id='c7-james'")).n === 2 && contractor.scope.serviceEngagementIds.size === 1);
  const create = async (input = {}, extra = {}) => {
    const result = await createContent(db, { actor: owner, clientId: 'c7-james', serviceEngagementId: 'c7-social-service', requestId: crypto.randomUUID(),
      input: { title: 'Garden launch', type: 'reel', visibility: 'client', recordingRequired: true, script: 'PRIVATE_SCRIPT first version',
        pillar: 'PRIVATE_PILLAR', hook: 'PRIVATE_HOOK', caption: 'PRIVATE_CAPTION', cta: 'PRIVATE_CTA', platforms: ['Instagram', 'TikTok'], targetPublishDate: '2026-09-22', ...input }, ...extra });
    assert.equal(result.ok, true, JSON.stringify(result)); return result.contentId;
  };
  const current = id => getContent(db, owner, id);
  const move = async (id, targetStage) => {
    const result = await transitionContent(db, { actor: owner, contentId: id, input: { targetStage, expectedRevision: (await current(id)).revision,
      ...targetStage === 'waiting_for_recording' ? { context: 'PRIVATE_WAITING_CONTEXT' } : {} }, now });
    assert.equal(result.ok, true, `${targetStage}: ${JSON.stringify(result)}`); return result;
  };
  const edit = async (id, input) => {
    const result = await updateContent(db, { actor: owner, contentId: id, expectedRevision: (await current(id)).revision, input });
    assert.equal(result.ok, true, JSON.stringify(result)); return result;
  };
  const calendar = who => contentCalendar(db, who, { start: '2026-09-01', end: '2026-09-30' });
  const portal = (who = client, view = 'current', time = now) => portalContent(db, who, { view }, { now: time });
  const ids = result => result.items.map(item => item.id);
  check('no Content hides the destination', !await hasPortalContent(db, client, { now }));
  const id = await create();
  const sibling = await create({ title: 'Lawrence update', recordingRequired: false, internalReviewRequired: false, clientApprovalRequired: false },
    { clientId: 'c7-lawrence', serviceEngagementId: 'c7-other-service' });
  await create({ title: 'PRIVATE_INTERNAL', visibility: 'internal' }, { serviceEngagementId: null });
  await create({ title: 'PRIVATE_RESTRICTED', visibility: 'restricted' }, { serviceEngagementId: null });
  check('C1/C3/C6 agree on exact contractor and Client scope without hidden counts',
    ids(await listContent(db, contractor)).join() === id && ids(await calendar(contractor)).join() === id && ids(await portal()).join() === id && !(await portal()).hasMore);
  for (const name of ['other', 'foreign']) {
    const who = await actor(name);
    check(`${name} cannot read the other Client or workspace through internal or portal Content`,
      await getContent(db, who, id) === null && await getPortalContent(db, who, id) === null);
  }
  check('canonical Systems engagement cannot be used as a Social parent', (await createContent(db, { actor: owner, clientId: 'c7-james',
    serviceEngagementId: 'c7-ghl-service', requestId: crypto.randomUUID(), input: { title: 'Invalid Social parent', type: 'reel' } })).reason === 'not_found');
  await move(id, 'script'); await move(id, 'waiting_for_recording');
  check('waiting drives one C4 request and one C6 action from the same Content',
    (await recordingRequests(db, client)).map(item => item.id).join() === id && ids(await portal(client, 'action')).join() === id);
  const bytes = new TextEncoder().encode('C7 original Client recording'), input = { requestId: crypto.randomUUID(), filename: 'Garden recording é.mp4', mimeType: 'video/mp4', byteSize: bytes.length, purpose: 'recording' };
  const upload = (who = client) => uploadContentFile(db, { actor: who, portal: true, bucket, contentId: id, input, bytes });
  const file = await upload(); assert.equal(file.ok, true);
  const download = (who = client, storage = bucket) => downloadContentFile(db, { actor: who, bucket: storage, fileId: file.fileId });
  check('C4 retry after response loss retains one Ready recording and one upload event', (await upload()).unchanged
    && (await one('SELECT count(*) n FROM assets WHERE creation_request_id=?', input.requestId)).n === 1
    && (await one("SELECT count(*) n FROM activity_events WHERE subject_id=? AND event_type='FILE_UPLOADED'", file.fileId)).n === 1);
  const safe = await getPortalContent(db, client, id);
  check('C6 exposes Ready metadata and original bytes through C4, never editorial or storage fields',
    safe.hasFiles && safe.files.items[0].id === file.fileId && !/PRIVATE|revision|workspace|objectKey|owner|script|caption/.test(JSON.stringify(safe))
    && await new Response((await download()).body).text() === new TextDecoder().decode(bytes));
  await run("UPDATE client_contacts SET user_id=NULL WHERE client_id='c7-james'");
  check('unlinking the issued Client removes navigation, counts, recordings, metadata, retries and bytes',
    !await hasPortalContent(db, await actor('client'), { now }) && (await portal()).items.length === 0 && !(await portal()).hasMore
    && await getPortalContent(db, client, id) === null && (await recordingRequests(db, client)).length === 0
    && (await upload()).reason === 'not_found' && await download() === null);
  await run("UPDATE client_contacts SET user_id='c7-client' WHERE client_id='c7-james'");
  check('relinking restores access with the same identity session', (await identity('client')).session.id === sessionIds.client && Boolean(await getPortalContent(db, await actor('client'), id)));

  // Cross-phase external-await race: a legitimate C2 transition wins while
  // C4 is reading R2. Bytes must be fenced even with an already loaded actor.
  const racingBucket = { async get(key) { const object = await bucket.get(key); await move(id, 'editing'); return object; } };
  check('a canonical C2 transition during R2 GET revokes the in-flight Client download', await download(client, racingBucket) === null);
  const editing = await getPortalContent(db, client, id);
  check('C6 action and File metadata disappear after leaving recording, while internal bytes survive',
    !editing.recordingNeeded && !editing.hasFiles && editing.files.items.length === 0 && (await portal(client, 'action')).items.length === 0
    && await new Response((await download(owner)).body).text() === new TextDecoder().decode(bytes));
  await move(id, 'internal_review'); await move(id, 'client_review');
  const requestInput = { requestId: crypto.randomUUID(), expectedRevision: (await current(id)).revision };
  const first = await requestContentApproval(db, { actor: owner, contentId: id, input: requestInput, now }); assert.equal(first.ok, true);
  const firstSnapshot = JSON.stringify((await getPortalApproval(db, client, first.roundId)).snapshot);
  check('formal Requested snapshot is the only portal route to review copy',
    (await getPortalContent(db, client, id)).approvalRoundId === first.roundId && ids(await portal(client, 'action')).join() === id
    && firstSnapshot.includes('PRIVATE_SCRIPT') && !JSON.stringify(await getPortalContent(db, client, id)).includes('PRIVATE_SCRIPT'));
  check('the Requested round freezes ordinary edits and generic approval bypasses',
    (await updateContent(db, { actor: owner, contentId: id, expectedRevision: (await current(id)).revision, input: { script: 'Forbidden replacement' } })).reason === 'conflict'
    && !(await transitionContent(db, { actor: owner, contentId: id, input: { targetStage: 'approved', expectedRevision: (await current(id)).revision } })).ok);
  const changes = { decision: 'changes_requested', feedback: 'Show the garden earlier.' };
  assert.equal((await respondContentApproval(db, { actor: client, roundId: first.roundId, input: changes, now })).ok, true);
  const firstHistory = (await contentApprovalHistory(db, owner, id)).items[0];
  check('changes requested remove portal review while preserving immutable snapshot and canonical revision context',
    await getPortalApproval(db, client, first.roundId) === null && (await current(id)).stage === 'revision_requested'
    && (await current(id)).stageContext === changes.feedback && JSON.stringify(firstHistory.snapshot) === firstSnapshot);
  await move(id, 'editing'); await edit(id, { script: 'PRIVATE_SCRIPT second version', targetPublishDate: '2026-09-25' });
  assert.equal((await setContentPlatforms(db, { actor: owner, contentId: id, input: { platforms: ['LinkedIn'], expectedRevision: (await current(id)).revision } })).ok, true);
  await move(id, 'internal_review'); await move(id, 'client_review');
  const second = await requestContentApproval(db, { actor: owner, contentId: id, input: { requestId: crypto.randomUUID(), expectedRevision: (await current(id)).revision }, now }); assert.equal(second.ok, true);
  const beforeStale = JSON.stringify(await current(id));
  check('lost old response/request retries cannot resolve or overwrite the second round',
    (await respondContentApproval(db, { actor: client, roundId: first.roundId, input: changes })).unchanged
    && (await requestContentApproval(db, { actor: owner, contentId: id, input: requestInput })).unchanged
    && !(await respondContentApproval(db, { actor: client, roundId: first.roundId, input: { decision: 'approved' } })).ok
    && JSON.stringify(await current(id)) === beforeStale && (await getPortalContent(db, client, id)).approvalRoundId === second.roundId);
  const history = await contentApprovalHistory(db, owner, id), review = await getPortalApproval(db, client, second.roundId);
  check('round two reflects canonical date/platform edits while prior round and snapshot remain identical',
    history.items.length === 2 && JSON.stringify(history.items[1]) === JSON.stringify(firstHistory)
    && review.snapshot.script === 'PRIVATE_SCRIPT second version' && review.snapshot.targetPublishDate === '2026-09-25' && review.snapshot.platforms.join() === 'LinkedIn'
    && (await calendar(contractor)).items[0].targetPublishDate === review.snapshot.targetPublishDate);

  check('assigned contractor and broad PM can read current history before revocation',
    (await contentApprovalHistory(db, contractor, id)).items.length === 2 && (await contentApprovalHistory(db, await actor('pm'), id)).items.length === 2
    && (await listContentFiles(db, contractor, id)).items.length === 1 && (await contentFileActivityRows(db, contractor, { contentId: id })).length === 1);
  await run("DELETE FROM service_assignments WHERE membership_id='c7-m-contractor'"); await assign('c7-other-service');
  const reassigned = await actor('contractor');
  check('reassignment changes list/calendar counts and denies old Content, history, Files and bytes on the same session',
    (await identity('contractor')).session.id === sessionIds.contractor && ids(await listContent(db, reassigned)).join() === sibling
    && ids(await calendar(reassigned)).join() === sibling && !(await listContent(db, reassigned)).hasMore
    && await getContent(db, contractor, id) === null && (await contentApprovalHistory(db, contractor, id)).items.length === 0
    && !(await contentApprovalHistory(db, contractor, id)).hasMore && (await listContentFiles(db, contractor, id)).items.length === 0
    && (await contentFileActivityRows(db, contractor, { contentId: id })).length === 0 && await download(contractor) === null);
  check('stale contractor cannot edit or change platforms after reassignment',
    (await updateContent(db, { actor: contractor, contentId: id, expectedRevision: (await current(id)).revision, input: { visibility: 'internal' } })).reason === 'not_found'
    && (await setContentPlatforms(db, { actor: contractor, contentId: id, input: null })).reason === 'not_found');
  await edit(id, { visibility: 'restricted' });
  const pm = await actor('pm');
  check('visibility restriction revokes broad PM and Client histories/actions without withdrawing the canonical round',
    await getContent(db, pm, id) === null && (await contentApprovalHistory(db, pm, id)).items.length === 0
    && (await contentFileActivityRows(db, pm, { contentId: id })).length === 0 && await getPortalApproval(db, client, second.roundId) === null
    && !await hasPortalContent(db, client, { now }) && (await portal(client, 'action')).items.length === 0
    && (await one('SELECT status FROM content_approval_rounds WHERE id=?', second.roundId)).status === 'requested');
  await run("INSERT INTO client_assignments(workspace_id,client_id,membership_id) VALUES('c7-agency','c7-james','c7-m-pm')");
  check('exact PM assignment restores restricted history on the same session, never Client access',
    (await identity('pm')).session.id === sessionIds.pm && (await contentApprovalHistory(db, await actor('pm'), id)).items.length === 2 && await getPortalContent(db, client, id) === null);
  await edit(id, { visibility: 'client' });
  await run("DELETE FROM service_assignments WHERE membership_id='c7-m-contractor'"); await assign('c7-social-service');
  check('returning exact assignment restores contractor history and internal original recording',
    (await contentApprovalHistory(db, await actor('contractor'), id)).items.length === 2
    && await new Response((await download(await actor('contractor'))).body).text() === new TextDecoder().decode(bytes));
  assert.equal((await respondContentApproval(db, { actor: client, roundId: second.roundId, input: { decision: 'approved' }, now })).ok, true);
  check('second approval removes action and old review access without exposing history through general Content',
    (await current(id)).stage === 'approved' && (await portal(client, 'action')).items.length === 0
    && await getPortalApproval(db, client, second.roundId) === null && !(await getPortalContent(db, client, id)).approvalRoundId);
  await move(id, 'scheduled'); await move(id, 'published');
  for (const stage of ['script', 'editing', 'approved', 'scheduled', 'published']) await move(sibling, stage);
  check('different pipeline combinations reach Published with canonical timestamps and separate Client discovery',
    (await current(id)).publishedAt === now.toISOString() && (await current(sibling)).publishedAt === now.toISOString()
    && ids(await portal(client, 'published')).join() === id && ids(await portal(await actor('other'), 'published')).join() === sibling
    && (await portal()).items.length === 0 && await hasPortalContent(db, client, { now }));
  const boundary = new Date(now.getTime() + 30 * 86400000), expired = new Date(boundary.getTime() + 1), future = new Date(now.getTime() - 1);
  check('actual publication drives inclusive 30-day navigation/list boundaries and excludes future timestamps',
    ids(await portal(client, 'published', boundary)).join() === id && await hasPortalContent(db, client, { now: boundary })
    && (await portal(client, 'published', expired)).items.length === 0 && !await hasPortalContent(db, client, { now: expired })
    && (await portal(client, 'published', future)).items.length === 0 && !await hasPortalContent(db, client, { now: future }));
  const publishedRevision = (await current(id)).revision;
  check('Published remains terminal after recording and two formal rounds', !(await transitionContent(db, { actor: owner, contentId: id,
    input: { targetStage: 'editing', expectedRevision: publishedRevision } })).ok && (await current(id)).revision === publishedRevision);
  check('the complete story preserves Client/Service lifecycles and relational integrity', JSON.stringify(await parents()) === beforeParents
    && (await all('PRAGMA foreign_key_check')).length === 0 && (await one('PRAGMA quick_check')).quick_check === 'ok');
}
