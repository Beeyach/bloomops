import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { setup } from './_work-projections.mjs';
const { OperationalHome } = await import('../components/bloomops/OperationalHome.jsx');
const { ProjectList } = await import('../components/bloomops/Projects.jsx');
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component,props));

test('empty Home hides empty sections and offers the canonical Work destination', async () => {
  const t=await setup(), html=render(OperationalHome,{projection:await t.home()});
  assert.match(html,/Nothing needs attention here right now/); assert.match(html,/href="\/work"/);
  assert.doesNotMatch(html,/<section|0 Actions|0 Projects|0 files|Available now|Coming soon|Finance|Social|Apps|Welcome back/i);
});

test('Home renders distinct accessible record links with no management controls or hidden metadata', async () => {
  const t=await setup(); t.tree();
  const html=render(OperationalHome,{projection:await t.home()});
  for(const id of ['home-overdue','home-projects','home-deliverables','home-recent']) assert.match(html,new RegExp(`aria-labelledby="${id}-title"`));
  assert.match(html,/\/work\/actions\/website-action/); assert.match(html,/\/work\/projects\/website#project-deliverables-title/); assert.match(html,/\/work\/projects\/website#project-files-title/);
  assert.match(html,/Deliverable delivered/); assert.match(html,/File uploaded/); assert.match(html,/1 of 1 milestones finished · 100%/);
  assert.doesNotMatch(html,/<button|<input|<select|<form|Upload file|Change status|Archive|SECRET_KEY|uploader|sha256|OLD_/);
  assert.doesNotMatch(html,/home-today-title|home-waiting-title|home-review-title/,'empty Action sections stay absent');
});

test('Work Projects gain only readable summaries and links to the exact Action views', async () => {
  const t=await setup(); t.tree(); t.action('waiting',{status:'waiting'}); t.action('review',{status:'review'});
  const html=render(ProjectList,{projects:(await t.summaries()).items});
  assert.match(html,/Summary for Project website/); assert.match(html,/3 open Actions/); assert.match(html,/2 Deliverables/); assert.match(html,/1 Ready file/);
  for(const view of ['overdue','waiting','review']) assert.match(html,new RegExp(`view=${view}`));
  assert.match(html,/Project website/); assert.match(html,/james · social · social/); assert.doesNotMatch(html,/undefined|NaN|SECRET_KEY/);
});

test('an Action-only Home has its Action link and no Project/Deliverable/File/Client summary links', async () => {
  const t=await setup(); t.tree(); t.action('own',{due_date:'2026-09-08',assignee_membership_id:'m-sam'});
  const html=render(OperationalHome,{projection:await t.home(await t.actor('sam'))});
  assert.match(html,/href="\/work\/actions\/own"/); assert.doesNotMatch(html,/href="\/work\/projects|href="\/clients|home-projects|home-deliverables|home-recent|milestones finished|Ready file/);
});

test('HTML-sensitive titles and filenames are text, never dashboard markup', async () => {
  const t=await setup(); t.action('x',{title:'<script>bad()</script>',due_date:'2026-09-08'}); t.file('html',{filename:'<img onerror=bad()>.txt'}); t.event('file','html');
  const html=render(OperationalHome,{projection:await t.home()});
  assert.match(html,/&lt;script&gt;bad\(\)&lt;\/script&gt;/); assert.match(html,/&lt;img onerror=bad\(\)&gt;/); assert.doesNotMatch(html,/<script|<img/);
});

test('Home and Work remain fresh server reads with no new dashboard endpoint or duplicate state', () => {
  const root=new URL('../',import.meta.url), source=path=>readFileSync(new URL(path,root),'utf8');
  for(const path of ['app/(internal)/page.jsx','app/(internal)/work/page.jsx']) { assert.match(source(path),/requireShell\('internal'\)/); assert.match(source(path),/force-dynamic/); }
  assert.match(source('app/(internal)/page.jsx'),/homeProjection/); assert.doesNotMatch(source('app/(internal)/page.jsx'),/workspaceOverview|AreaMap|StateRows/);
  assert.match(source('app/(internal)/work/page.jsx'),/normalizeActionFilters/); assert.match(source('app/(internal)/work/page.jsx'),/listActions/);
  assert.doesNotMatch(source('lib/bloomops/work-projections.mjs'),/\.insert\(|\.update\(|\.delete\(|getCloudflareContext|objectKey|uploaderMembershipId|\.get\(/);
});
