// Optional C7 checkpoints in the existing C5 two-round browser journey.
// The caller already enforces loopback/development/local R2 mail. Reuse its
// issued browser contexts, keyboard helpers and five-width layout checks.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function releaseCReview({ base, sql, lit, check, widths, layout, activate, post, owner, client, team, other, members, ws, cl, otherClient, dept, service }) {
  const read = (who, path) => who.context.request.get(base + path);
  const json = async (who, path) => { const r = await read(who, path); assert.equal(r.status(), 200, await r.text()); assert.match(r.headers()['cache-control'], /no-store/); return r.json(); };
  const content = id => `/api/bloomops/content/${id}`;
  const detail = id => `/api/bloomops/portal/content/${id}`;
  const list = (view = 'current') => `/api/bloomops/portal/content?view=${view}`;
  const ids = result => result.items.map(item => item.id);
  const screenshot = async (name, page) => { for (const width of widths) await layout('c7-' + name, page, width); };
  const session = async who => { const response = await read(who, '/api/auth/get-session'); assert.equal(response.status(), 200); return (await response.json()).session.id; };
  const originalSessions = { client: await session(client), team: await session(team) };
  await client.page.goto(base + '/portal');
  check('C7 empty workspace hides Client Content navigation', await client.page.locator('a[href="/portal/content"]').count() === 0);
  await owner.page.goto(base + '/social'); await screenshot('social-empty', owner.page);
  for (const [name, path, reset] of [
    ['invalid-list', '/social?page=0', 'Reset filters'],
    ['invalid-month', '/social/calendar?month=2026-13', 'Reset calendar'],
    ['invalid-calendar-page', '/social/calendar?month=2026-09&page=0', 'Reset calendar'],
  ]) {
    const errorText = name === 'invalid-list' ? 'Choose only the available Content filters.' : 'Choose a valid month and available filters.';
    // The hydrated shell also has an empty global live region. Assert this
    // page's announced error, not the number of unrelated alert containers.
    const error = owner.page.getByRole('alert').filter({ hasText: errorText });
    await owner.page.goto(base + path); await screenshot(name, owner.page);
    const link = owner.page.getByRole('link', { name: reset, exact: true }); await link.focus();
    // Enter keyboard modality and return through the real tab order before
    // checking :focus-visible; programmatic focus alone is input-dependent.
    await owner.page.keyboard.press('Shift+Tab'); await owner.page.keyboard.press('Tab');
    await owner.page.waitForFunction(n => n === document.activeElement, await link.elementHandle());
    check(`C7 ${name} retains announced recovery and visible keyboard focus`, await error.count() === 1
      && await link.evaluate(n => n === document.activeElement && parseFloat(getComputedStyle(n).outlineWidth) > 0));
    await activate(owner.page, link);
    await owner.page.waitForURL(url => url.search === '');
    check(`C7 ${name} reset reaches the valid view`, await error.count() === 0);
  }
  const systems = `${ws}-systems`, otherService = `${ws}-other-service`;
  sql(`INSERT INTO departments(id,workspace_id,name,slug) VALUES(${lit(systems)},${lit(ws)},'Systems','systems')`);
  sql(`INSERT INTO service_types(id,workspace_id,name,slug,department_id) VALUES(${lit(systems)},${lit(ws)},'GHL','ghl',${lit(systems)})`);
  sql(`INSERT INTO service_engagements(id,workspace_id,client_id,service_type_id) VALUES(${lit(systems)},${lit(ws)},${lit(cl)},${lit(systems)}),(${lit(otherService)},${lit(ws)},${lit(otherClient)},${lit(dept)})`);
  sql(`INSERT INTO department_memberships(workspace_id,department_id,membership_id) VALUES(${lit(ws)},${lit(dept)},${lit(members.team.membership)})`);
  const sibling = (await post(`/api/bloomops/clients/${otherClient}/services/${otherService}/content`, {
    requestId: randomUUID(), title: 'Other Studio seasonal update', type: 'static_post', visibility: 'client', recordingRequired: false,
    internalReviewRequired: false, clientApprovalRequired: false, platforms: ['YouTube'], targetPublishDate: '2026-09-26',
  }, owner, 201)).contentId;
  for (const visibility of ['internal', 'restricted']) await post(`/api/bloomops/clients/${cl}/content`, {
    requestId: randomUUID(), title: `C7_HIDDEN_${visibility}`, type: 'other', visibility, targetPublishDate: '2026-09-01',
  }, owner, 201);
  const parentFacts = () => JSON.stringify(sql(`SELECT id,relationship_status AS status FROM bloomops_clients WHERE workspace_id=${lit(ws)} UNION ALL SELECT id,status FROM service_engagements WHERE workspace_id=${lit(ws)} ORDER BY id`));
  const originalParents = parentFacts();
  check('C7 multiple services share one Client and hidden/other-Client work cannot enable navigation',
    sql(`SELECT count(*) n FROM service_engagements WHERE client_id=${lit(cl)}`)[0].n === 2 && (await json(client, list())).items.length === 0);
  await client.page.goto(base + '/portal/content'); await client.page.waitForURL(base + '/portal');
  check('C7 hidden-only direct Content access redirects Home', new URL(client.page.url()).pathname === '/portal');
  const internalItem = async id => (await json(owner, content(id))).item;
  const move = async (id, targetStage) => post(content(id) + '/transition', { targetStage, expectedRevision: (await internalItem(id)).revision });

  return {
    async recording(id, fileId, bytes) {
      const general = (await json(client, detail(id))).item;
      check('C7 recording, Content detail and action list share one exact Ready File', general.recordingNeeded && general.hasFiles
        && general.files.items.length === 1 && general.files.items[0].id === fileId && ids(await json(client, list('action'))).join() === id);
      const response = await read(client, `/api/bloomops/files/${fileId}/download`);
      check('C7 Client recording bytes return through the protected C4 endpoint', response.status() === 200 && (await response.body()).equals(bytes));
      await client.page.goto(base + '/portal');
      check('C7 discoverable recording enables conditional Content navigation', await client.page.locator('a[href="/portal/content"]').count() === 1);
      await client.page.goto(base + '/portal/content?view=action'); await screenshot('recording-action', client.page);
      await client.page.goto(base + `/portal/content/${id}`); await screenshot('recording-detail-long-file', client.page);
      check('C7 general Content excludes editorial copy and storage authority', !/C5_PRIVATE_PILLAR|C5_PRIVATE_WAITING|objectKey|sha256|ownerMembershipId|completionRevision/.test(await client.page.content()));
      await activate(client.page, client.page.getByRole('link', { name: 'Recording needed', exact: true }));
      await client.page.waitForURL(/\/portal\/recordings\//);
      const opener = client.page.getByRole('button', { name: 'Upload recording', exact: true });
      await activate(client.page, opener); const dialog = client.page.getByRole('dialog');
      await client.page.waitForFunction(() => document.activeElement?.id === 'file-upload');
      await dialog.locator('#file-upload').setInputFiles({ name: 'Garden recording ' + 'long '.repeat(25) + 'é.mp4', mimeType: 'video/mp4', buffer: bytes });
      await screenshot('recording-dialog-long-file', client.page);
      await client.page.keyboard.press('Escape');
      check('C7 recording dialog restores keyboard focus', await opener.evaluate(n => n === document.activeElement));
    },
    async review(id, roundId, number, fileId) {
      const current = await json(client, list()), action = await json(client, list('action')), general = (await json(client, detail(id))).item;
      check(`C7 round ${number} is the only current/action item; former recording metadata is gone`, ids(current).join() === id && !current.hasMore
        && ids(action).join() === id && !action.hasMore && general.approvalRoundId === roundId && !general.recordingNeeded && !general.hasFiles && general.files.items.length === 0);
      check(`C7 round ${number} is unavailable to another Client and old recording downloads are denied`,
        (await read(other, detail(id))).status() === 404 && (await read(other, `/api/bloomops/portal/approvals/${roundId}`)).status() === 404
        && (await read(client, `/api/bloomops/files/${fileId}/download`)).status() === 404);
      await client.page.goto(base + '/portal/content?view=action'); await screenshot(`round-${number}-action`, client.page);
      await activate(client.page, client.page.getByRole('link', { name: 'Approval needed', exact: true }));
      await client.page.waitForURL(url => url.pathname === `/portal/approvals/${roundId}`);
      if (number !== 2) return;
      sql(`INSERT INTO service_assignments(workspace_id,service_engagement_id,membership_id) VALUES(${lit(ws)},${lit(service)},${lit(members.team.membership)})`);
      await team.page.goto(base + `/social/${id}`);
      check('C7 scoped Social contractor reads both rounds and the canonical internal File', await team.page.locator('.bo-review-details').count() === 2
        && (await read(team, `/api/bloomops/files/${fileId}/download`)).status() === 200);
      sql(`DELETE FROM service_assignments WHERE membership_id=${lit(members.team.membership)}`);
      sql(`INSERT INTO service_assignments(workspace_id,service_engagement_id,membership_id) VALUES(${lit(ws)},${lit(otherService)},${lit(members.team.membership)})`);
      const scoped = await json(team, '/api/bloomops/content');
      const calendar = await json(team, '/api/bloomops/content/calendar?start=2026-09-01&end=2026-09-30');
      check('C7 same issued contractor session sees only reassigned Client Content and truthful counts', await session(team) === originalSessions.team
        && ids(scoped).join() === sibling && !scoped.hasMore && ids(calendar).join() === sibling && !calendar.hasMore);
      for (const path of [content(id), content(id) + '/files', `/api/bloomops/files/${fileId}/download`]) {
        check('C7 reassignment removes old Content and File API authority', (await read(team, path)).status() === 404);
      }
      check('C7 reassigned contractor cannot mutate the old Content', (await team.context.request.patch(base + content(id), {
        headers: { origin: base }, data: { visibility: 'internal', expectedRevision: (await internalItem(id)).revision },
      })).status() === 404);
      check('C7 old browser detail and its history become not found', (await team.page.goto(base + `/social/${id}`)).status() === 404);
      await team.page.goto(base + '/social/calendar?month=2026-09'); await screenshot('reassigned-calendar', team.page);
      sql(`DELETE FROM service_assignments WHERE membership_id=${lit(members.team.membership)}`);
      // The base C5 journey later assigns this same session again for its
      // independent coordinator-vs-contractor withdrawal check.
    },
    async published(id) {
      await move(id, 'scheduled'); await move(id, 'published');
      for (const stage of ['script', 'editing', 'approved', 'scheduled', 'published']) await move(sibling, stage);
      const recent = await json(client, list('published'));
      check('C7 both conditional pipelines publish, each Client discovers only its own publication', ids(recent).join() === id
        && ids(await json(other, list('published'))).join() === sibling && (await json(client, list())).items.length === 0
        && (await json(client, list('action'))).items.length === 0 && recent.items[0].publishedAt === (await internalItem(id)).publishedAt);
      await owner.page.goto(base + '/social'); await screenshot('social-list', owner.page);
      await owner.page.goto(base + '/social/calendar?month=2026-09'); await screenshot('calendar', owner.page);
      await client.page.goto(base + '/portal');
      check('C7 recent-only Content retains navigation with no current work', await client.page.locator('a[href="/portal/content"]').count() === 1);
      for (const view of ['current', 'action', 'published']) {
        await client.page.goto(base + `/portal/content?view=${view}`); await screenshot(`published-${view}`, client.page);
      }
      await client.page.emulateMedia({ reducedMotion: 'reduce' });
      await client.page.goto(base + `/portal/content/${id}`); await layout('c7-portal-reduced-motion', client.page, 320);
      check('C7 reduced-motion portal uses the same safe static summary', await client.page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches
        && document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations === Infinity).length === 0));
      await client.page.emulateMedia({ reducedMotion: 'no-preference' });
      check('C7 whole browser journey leaves Client and Service lifecycles unchanged', parentFacts() === originalParents);
    },
    async revoked(id, fileId) {
      for (const view of ['current', 'action', 'published']) {
        const result = await json(client, list(view));
        check(`C7 contact revocation empties ${view} without hidden overflow on the same session`, result.items.length === 0 && !result.hasMore);
      }
      check('C7 contact revocation retains identity but denies Content and old bytes', await session(client) === originalSessions.client
        && (await read(client, detail(id))).status() === 404 && (await read(client, `/api/bloomops/files/${fileId}/download`)).status() === 404);
      await client.page.goto(base + '/portal/content'); await client.page.waitForURL(base + '/portal');
      check('C7 revoked direct index redirects Home and removes navigation', new URL(client.page.url()).pathname === '/portal'
        && await client.page.locator('a[href="/portal/content"]').count() === 0);
      await screenshot('revoked-portal', client.page);
    },
  };
}
