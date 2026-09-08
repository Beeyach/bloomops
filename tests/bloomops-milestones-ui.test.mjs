import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { setup } from './_milestones.mjs';
import { portalMilestones, portalMilestoneSummaries } from '../lib/bloomops/milestones.mjs';
import { portalProjects } from '../lib/bloomops/projects.mjs';
const {MilestoneList,MilestoneProgress,PortalMilestones}=await import('../components/bloomops/Milestones.jsx');
const {PortalHome}=await import('../components/bloomops/PortalHome.jsx');
const render=(component,props)=>renderToStaticMarkup(React.createElement(component,props));
test('zero visible milestones renders no portal list or fabricated progress',async()=>{
  const t=await setup();await t.add({name:'Secret'});
  assert.equal(render(PortalMilestones,{summary:await portalMilestones(t.db,await t.actor('james'),t.projectId)}),'');
  assert.equal(render(MilestoneProgress,{progress:null}),'');
});
test('portal uses safe labels and finished wording including Skipped, without hidden counts or controls',async()=>{
  const t=await setup();const a=await t.add({name:'INTERNAL_NAME',clientLabel:'Your launch',visibility:'client'});await t.transition(a.milestoneId,'skipped');await t.add({name:'SECRET'});
  const html=render(PortalMilestones,{summary:await portalMilestones(t.db,await t.actor('james'),t.projectId)});
  assert.match(html,/Your launch/);assert.match(html,/1 of 1 milestones finished/);assert.match(html,/Skipped/);assert.doesNotMatch(html,/INTERNAL_NAME|SECRET|revision|position|requestId|Change|Edit|Move|Activity/);
});
test('internal read-only list preserves order and Waiting state without later-phase placeholders',async()=>{
  const t=await setup(),a=await t.add({name:'Brief'}),b=await t.add({name:'Build'});await t.order([b.milestoneId,a.milestoneId]);await t.transition(b.milestoneId,'waiting');
  const html=render(MilestoneList,{items:(await t.list()).items});assert.ok(html.indexOf('Build')<html.indexOf('Brief'));assert.match(html,/Waiting/);assert.doesNotMatch(html,/<button|Actions|Deliverables|Files|Dependencies/);
});
test('portal nests each ordered Milestone under its correct Project and hides empty sections',async()=>{
  const t=await setup(),actor=await t.actor('james');await t.add({clientLabel:'Your brief',visibility:'client'});await t.create({visibility:'client',name:'No milestones yet'});
  const html=render(PortalHome,{workspaceName:'Agency',user:{name:'James'},clients:[{id:'james',name:'James',onboarding:null,projects:await portalProjects(t.db,actor)}],milestones:await portalMilestoneSummaries(t.db,actor)});
  assert.equal((html.match(/aria-label="Project milestones"/g)||[]).length,1);assert.match(html,/Your brief/);assert.doesNotMatch(html,/0 of 0|Actions|Deliverables|Dependencies|Internal history/);
});
