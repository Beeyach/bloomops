import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { setup } from './_projects.mjs';
import { portalProjects } from '../lib/bloomops/projects.mjs';
const { ProjectList, ProjectFacts } = await import('../components/bloomops/Projects.jsx');
const { PortalHome } = await import('../components/bloomops/PortalHome.jsx');
const { ClientTabs, isClientTab } = await import('../components/bloomops/Clients.jsx');
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));

test('Projects tab exists only when there is reachable Project work', () => {
  assert.doesNotMatch(render(ClientTabs, { clientId: 'james' }), /tab=projects/);
  assert.match(render(ClientTabs, { clientId: 'james', hasProjects: true, active: 'projects' }), /tab=projects.*aria-current="page"/);
  assert.equal(isClientTab('projects'), false);
  assert.equal(isClientTab('projects', true), true);
});
test('empty and filtered lists explain their actual state without invented work', () => {
  assert.match(render(ProjectList, { projects: [] }), /No projects yet/);
  const filtered = render(ProjectList, { projects: [], filtered: true });
  assert.match(filtered, /No projects match this view/);
  assert.doesNotMatch(filtered, /Create project|Milestones|Deliverables|Files/);
});
test('internal Project facts retain independent status, health and completion and do not imply parent access', async () => {
  const t = await setup(), { projectId } = await t.create({ health: 'at_risk' });
  const project = await t.get(projectId);
  const html = render(ProjectFacts, { project });
  assert.match(html, /Planned/); assert.match(html, /At Risk/); assert.match(html, /Internal/);
  assert.doesNotMatch(html, /href="\/clients/);
  assert.match(render(ProjectFacts, { project, clientHref: '/clients/james' }), /href="\/clients\/james"/);
});
test('portal renders only the dedicated projection and suppresses irrelevant Projects sections', async () => {
  const t = await setup();
  await t.create({ name: 'Internal secret', health: 'at_risk' });
  await t.create({ name: 'Hidden team label', clientLabel: 'Your website', visibility: 'client', ownerMembershipId: 'm-sam' });
  const projects = await portalProjects(t.db, await t.actor('james'));
  const props = { workspaceName: 'Agency', user: { name: 'James' }, clients: [{ id: 'james', name: 'James', onboarding: null, projects }] };
  const html = render(PortalHome, props);
  assert.match(html, /Your projects/); assert.match(html, /Your website/);
  assert.doesNotMatch(html, /Internal secret|Hidden team label|At Risk|m-sam|Activity|Assignments|Milestones|Deliverables/);
  assert.doesNotMatch(render(PortalHome, { ...props, clients: [{ ...props.clients[0], projects: [] }] }), /Your projects/);
});
test('multi-client portal keeps each Project under its own named account', () => {
  const html = render(PortalHome, { workspaceName: 'Agency', user: { name: 'James' }, clients: ['James', 'Lawrence'].map(name => ({ id: name, name, onboarding: null, projects: [{ id: name, label: `${name} delivery`, statusLabel: 'Planned' }] })) });
  for (const name of ['James', 'Lawrence']) assert.match(html, new RegExp(`${name} · Projects[\\s\\S]*?${name} delivery`));
});
