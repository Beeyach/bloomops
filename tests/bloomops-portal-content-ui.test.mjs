import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime.js';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime.js';
const { PortalContentList, PortalContentDetail } = await import('../components/bloomops/PortalContent.jsx');
const { default: PortalShell } = await import('../components/bloomops/PortalShell.jsx');
const { default: Loading } = await import('../app/portal/content/loading.jsx');
const { default: ErrorState } = await import('../app/portal/content/error.jsx');
const item={id:'content',title:'A seasonal idea',type:'reel',clientName:'James',statusLabel:'In progress',targetPublishDate:'2026-09-22',publishedAt:null,platforms:['Instagram'],recordingNeeded:false,approvalRoundId:null,hasFiles:false,files:{items:[]}};
const render=(component,props={})=>renderToStaticMarkup(React.createElement(AppRouterContext.Provider,{value:{refresh(){}}},React.createElement(PathnameContext.Provider,{value:'/portal/content/content'},React.createElement(component,props))));
test('conditional portal navigation remains separate from the internal shell and identifies the current Content subtree',()=>{
  const props={workspace:{name:'Garden Studio'},user:{name:'James',email:'james@example.com'},children:'PAGE'};
  assert.doesNotMatch(render(PortalShell,props),/href="\/portal\/content"/);
  const html=render(PortalShell,{...props,hasContent:true});assert.match(html,/aria-label="Client portal"/);assert.match(html,/href="\/portal\/content" aria-current="page"/);assert.doesNotMatch(html,/href="\/(social|team|finance|settings)"/);
});
test('bounded list presents dates, labels and narrow action links without internal controls or counts',()=>{
  const html=render(PortalContentList,{result:{items:[{...item,title:'<script>long</script>'+'Word'.repeat(100),recordingNeeded:true,approvalRoundId:'round',hasFiles:true}],view:'current',page:1,hasMore:true}});
  for(const fragment of ['Planned for','Instagram','Recording needed','Approval needed','View files','Next page','&lt;script&gt;'])assert.ok(html.includes(fragment),fragment);
  for(const path of ['/portal/recordings/content','/portal/approvals/round','/portal/content/content#content-files-title'])assert.ok(html.includes(path));
  assert.doesNotMatch(html,/<script>|Total|overflow|Owner|Internal Review|stage_context|type="file"|Approve this round/);
});
test('detail is calm when no action is needed and shows only Ready metadata supplied by the canonical File projection',()=>{
  const html=render(PortalContentDetail,{item});assert.match(html,/Nothing is needed from you right now/);assert.match(html,/Files/);assert.doesNotMatch(html,/Recording needed|Approval needed|<textarea|type="file"/);
});
for(const view of ['current','action','published'])test(`${view} has a useful empty state and no count or irrelevant action`,()=>{
  const html=render(PortalContentList,{result:{items:[],view,page:1,hasMore:false}});assert.doesNotMatch(html,/Content pages|Recording needed|Approval needed|0 items/);assert.match(html,view==='published'?/past 30 days/:view==='action'?/all set for now/:/Shared work will appear/);
});
test('loading and error states expose accessible recovery without server error content',()=>{
  assert.match(render(Loading),/role="status" aria-busy="true"/);
  const html=render(ErrorState,{error:new Error('PRIVATE SQL stack'),reset(){}});assert.match(html,/Try again/);assert.match(html,/href="\/portal"/);assert.doesNotMatch(html,/PRIVATE|SQL|stack/);
});
