import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { setup } from './_actions.mjs';
import { portalProjects } from '../lib/bloomops/projects.mjs';
const { ActionList, ActionFacts, ActionFilters, ActionPagination, WorkTabs } = await import('../components/bloomops/Actions.jsx');
const { PortalHome } = await import('../components/bloomops/PortalHome.jsx');
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));

test('Work exposes Actions and Projects with seven functional GET views and all filters', () => {
  const tabs = render(WorkTabs, {}), html = render(ActionFilters, {});
  assert.match(tabs, /aria-label="Work sections"/); assert.match(tabs, /href="\/work"[^>]*aria-current="page"/); assert.match(tabs, /tab=projects/);
  for (const view of ['mine', 'today', 'upcoming', 'waiting', 'review', 'overdue', 'all']) assert.match(html, new RegExp(`view=${view}`));
  for (const field of ['clientId', 'departmentId', 'serviceEngagementId', 'projectId', 'assigneeMembershipId', 'status', 'priority']) assert.match(html, new RegExp(`name="${field}"`));
  assert.match(html, /Apply filters/); assert.match(html, /Clear filters/);
});

test('Action rows show responsibility, priority, date, lifecycle and derived blocking without implying parent access', async () => {
  const t = await setup(), a = t.seedAction('Build', { due_date: '2026-09-01', assignee_membership_id: 'm-sam', priority: 'high' }), b = t.seedAction('SECRET');
  await t.depend(a, b); const action = await t.action(a, await t.actor('sam'));
  const html = render(ActionList, { items: [action] });
  for (const text of ['Build', 'james', 'Launch the website', 'sam', 'High priority', '2026-09-01', 'To Do', 'Dependency blocked']) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /SECRET|Overdue|href="\/clients|href="\/work\/projects|task|Deliverables|Files|Approvals/);
});

test('empty and bounded views explain their state, with working pagination preserving filters', () => {
  assert.match(render(ActionList, {}), /No Actions in this view/);
  const html = render(ActionPagination, { result: { page: 2, hasMore: true }, view: 'waiting', filters: { clientId: 'james' } });
  assert.match(html, /Previous page/); assert.match(html, /Next page/); assert.match(html, /200 Actions per page/); assert.match(html, /clientId=james/); assert.match(html, /page=3/);
});

test('Action details preserve multiline Waiting context, inactive responsibility and terminal timestamps', async () => {
  const t = await setup(), { actionId: id } = await t.addAction({ description: 'Build\nReview', priority: 'urgent' });
  await t.progress(id, 'waiting', { waitingType: 'ary' });
  const html = render(ActionFacts, { action: await t.action(id) });
  assert.match(html, /Waiting on Ary/); assert.match(html, /Build\nReview/); assert.match(html, /Urgent/); assert.doesNotMatch(html, /revision|workspaceId|creationRequestId/);
});

test('Client portal gains no Action links, counts, history or Work navigation', async () => {
  const t = await setup(); await t.addAction({ title: 'SECRET_ACTION' });
  const projects = await portalProjects(t.db, await t.actor('james'));
  const html = render(PortalHome, { workspaceName: 'Agency', user: { name: 'James' }, clients: [{ id: 'james', name: 'James', onboarding: null, projects }] });
  assert.doesNotMatch(html, /SECRET_ACTION|Actions|Dependencies|Action history|\/work/);
});
