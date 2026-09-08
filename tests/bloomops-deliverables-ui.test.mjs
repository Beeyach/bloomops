import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { setup } from './_deliverables.mjs';
import { portalProjects } from '../lib/bloomops/projects.mjs';
const {DeliverableList,PortalDeliverables}=await import('../components/bloomops/Deliverables.jsx');
const {PortalHome}=await import('../components/bloomops/PortalHome.jsx');
const render=(component,props)=>renderToStaticMarkup(React.createElement(component,props));
test('zero visible Deliverables renders no portal list, count, progress or future controls',async()=>{
  const t=await setup();await t.add({title:'Secret'});await t.add({title:'Restricted',visibility:'restricted'});
  assert.equal(render(PortalDeliverables,{summary:await t.portal()}),'');
});
test('portal renders safe labels and delivery status without internal QA or coordination controls',async()=>{
  const t=await setup(),a=await t.add({title:'PRIVATE_TITLE',description:'PRIVATE_DESCRIPTION',clientLabel:'Your website',visibility:'client',targetDate:'2026-09-20'});await t.add({title:'PRIVATE_FALLBACK',visibility:'client'});
  for(const status of ['in_progress','internal_review','approved','delivered'])await t.transition(a.deliverableId,status);
  const html=render(PortalDeliverables,{summary:await t.portal()});assert.match(html,/Your website/);assert.match(html,/Delivered/);assert.match(html,/>Deliverable</);
  assert.doesNotMatch(html,/PRIVATE|revision|requestId|Edit|Change|Approve|Reject|Upload|Version|Comment|Activity|progress|of [0-9]/);
});
test('internal read-only list presents output details separately from Actions',async()=>{
  const t=await setup(),a=await t.add({title:'Website handoff',description:'QA notes'});await t.transition(a.deliverableId,'in_progress');await t.transition(a.deliverableId,'internal_review');
  const html=render(DeliverableList,{items:(await t.list()).items});assert.match(html,/Website handoff/);assert.match(html,/QA notes/);assert.match(html,/Internal Review/);assert.doesNotMatch(html,/<button|Dependencies|Assignee|Upload|Version|Approve/);
});
test('portal nests Deliverables under the correct Project and omits hidden-only Project sections',async()=>{
  const t=await setup(),actor=await t.actor('james');await t.add({clientLabel:'Your website',visibility:'client'});const hidden=(await t.create({visibility:'client',name:'Another project'})).projectId;await t.add({}, {projectId:hidden});
  const html=render(PortalHome,{workspaceName:'Agency',user:{name:'James'},clients:[{id:'james',name:'James',onboarding:null,projects:await portalProjects(t.db,actor)}],deliverables:{[t.projectId]:await t.portal(actor),[hidden]:await t.portal(actor,hidden)}});
  assert.equal((html.match(/aria-label="Project deliverables"/g)||[]).length,1);assert.match(html,/Your website/);assert.doesNotMatch(html,/No Deliverables|0 of 0|Internal history|Dependencies/);
});
