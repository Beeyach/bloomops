import './_jsx.mjs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const {default:ContentForm}=await import('../components/bloomops/ContentForm.jsx');
const {AppRouterContext}=await import('next/dist/shared/lib/app-router-context.shared-runtime.js');
const {ContentDetail,ContentList}=await import('../components/bloomops/ContentViews.jsx');
import { setup } from './_content.mjs';
import { contentOptions } from '../lib/bloomops/content.mjs';
const render=(C,p)=>renderToStaticMarkup(React.createElement(AppRouterContext.Provider,{value:{push(){},refresh(){}}},React.createElement(C,p)));
test('real form exposes exact editorial fields, booleans and types; no future workflow controls',async()=>{
 const t=await setup(),options=await contentOptions(t.db,t.owner),html=render(ContentForm,{options});
 for(const field of['title','pillar','type','ownerMembershipId','hook','script','caption','cta','recordingRequired','internalReviewRequired','clientApprovalRequired','targetPublishDate','visibility'])assert.match(html,new RegExp(`id="content-${field}"`));
 assert.equal((html.match(/type="checkbox"/g)||[]).length,3);assert.match(html,/shares only the title and recording request/);assert.doesNotMatch(html,/name="stage"|Upload|Approve|Calendar|Pipeline|type="file"/);
});
test('detail escapes long editorial text and presents current canonical facts',async()=>{
 const t=await setup(),{contentId}=await t.add({title:'A'.repeat(200),script:'<script>alert(1)</script>\n'+'Text '.repeat(3000),visibility:'client'}),item=await t.item(contentId),html=render(ContentDetail,{item});assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/Idea/);assert.match(html,/Edit details/);assert.match(html,/Only a recording request is shared/);
});
test('empty and visible overflow have truthful pagination and preserve filters',async()=>{
 const t=await setup(),options=await contentOptions(t.db,t.owner);const empty=render(ContentList,{result:await t.list(),options});assert.match(empty,/No Content here yet/);assert.doesNotMatch(empty,/Next page/);
 const {contentId}=await t.add(),item=await t.item(contentId),html=render(ContentList,{result:{items:[item],page:2,hasMore:true},options,query:{type:'reel'}});assert.match(html,/Previous page/);assert.match(html,/Next page/);assert.match(html,/type=reel&amp;page=3/);assert.match(html,/More Content is available/);
});
test('every Content page performs its own server authorization; no portal routes',()=>{
 for(const file of['page.jsx','new/page.jsx','[contentId]/page.jsx','[contentId]/edit/page.jsx'])assert.match(readFileSync(new URL(`../app/(internal)/social/${file}`,import.meta.url),'utf8'),/requireShell\('internal'\)/);
});
