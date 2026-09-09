import './_jsx.mjs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_content-approvals.mjs';
import { contentOptions } from '../lib/bloomops/content.mjs';
const {AppRouterContext}=await import('next/dist/shared/lib/app-router-context.shared-runtime.js');
const {default:PortalApproval}=await import('../components/bloomops/PortalApproval.jsx');
const {default:ContentApprovals}=await import('../components/bloomops/ContentApprovals.jsx');
const {default:ContentForm}=await import('../components/bloomops/ContentForm.jsx');
const {PortalHome}=await import('../components/bloomops/PortalHome.jsx');
const render=(C,props)=>renderToStaticMarkup(React.createElement(AppRouterContext.Provider,{value:{refresh(){}}},React.createElement(C,props)));
test('Client page uses immutable escaped copy, narrow actions and disabled pre-hydration writes',async()=>{
  const t=await setup();await t.edit(t.contentId,{script:'<script>alert(1)</script>\n'+'Long '.repeat(3000)});const {roundId}=await t.request(),html=render(PortalApproval,{item:await t.portal(roundId)});
  assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|PRIVATE|Internal owner|Content pillar|Withdraw|production stage|objectKey|href="\/social/);assert.match(html,/Request changes/);assert.match(html,/Approve/);assert.match(html,/disabled=""/);assert.match(html,/files are not included/);
});
test('internal history presents independent rounds and feedback, Team has no coordinator controls',async()=>{
  const t=await setup(),first=await t.request();await t.respond(first.roundId,'changes_requested','<b>Please revise</b>');const second=await t.request();assert.equal(second.ok,false);
  const history=await t.rounds(),item=await t.item(t.contentId),html=render(ContentApprovals,{item,history,mayManage:false});
  assert.match(html,/Round 1/);assert.match(html,/Changes requested/);assert.match(html,/&lt;b&gt;Please revise&lt;\/b&gt;/);assert.match(html,/Review snapshot/);assert.doesNotMatch(html,/Withdraw request|Request Client approval/);
});
test('edit form freezes reviewed fields but permits live visibility revocation',async()=>{
  const t=await setup();await t.request();const item={...await t.item(t.contentId),approvalRequested:true},html=render(ContentForm,{item,options:await contentOptions(t.db,t.owner)});
  for(const key of ['title','script','caption','targetPublishDate','clientApprovalRequired'])assert.match(html,new RegExp(`id="content-${key}"[^>]*disabled=""`));
  assert.doesNotMatch(html,/id="content-visibility"[^>]*disabled/);assert.match(html,/Visibility and internal ownership remain editable/);
});
test('portal Home adds only eligible approval requests, no empty section or general Content navigation',()=>{
  const props={user:{name:'James'},workspaceName:'Studio',clients:[{id:'c',name:'James'}]};assert.doesNotMatch(render(PortalHome,props),/Approval needed|\/approvals\//);
  const html=render(PortalHome,{...props,approvals:{items:[{id:'round',title:'Your next post'}],hasMore:false}});assert.match(html,/Approval needed/);assert.match(html,/\/portal\/approvals\/round/);assert.doesNotMatch(html,/\/portal\/content|\/social|calendar|200 requests/);
});
