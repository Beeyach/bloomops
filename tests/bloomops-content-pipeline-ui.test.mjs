import './_jsx.mjs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const {default:Pipeline}=await import('../components/bloomops/ContentPipeline.jsx');
const {AppRouterContext}=await import('next/dist/shared/lib/app-router-context.shared-runtime.js');
const render=item=>renderToStaticMarkup(React.createElement(AppRouterContext.Provider,{value:{refresh(){}}},React.createElement(Pipeline,{item:{id:'item',revision:1,...item}})));
for(const [stage,flags,expected]of [['idea',{},['Move to Script']],['script',{recordingRequired:true},['Move to Waiting for Recording']],['script',{recordingRequired:false},['Move to Editing']],['editing',{internalReviewRequired:false,clientApprovalRequired:false},['Move to Approved']],['internal_review',{clientApprovalRequired:true},['Move to Client Review','Request revision']],['client_review',{},['Move to Approved','Request revision']],['revision_requested',{},['Move to Editing']],['published',{publishedAt:'2026-09-01T00:00:00.000Z'},[]]])test(`${stage} UI exposes only applicable actions and guards hydration`,()=>{
 const html=render({stage,...flags});const labels=[...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map(m=>m[1].replace(/<[^>]*>/g,''));assert.deepEqual(labels,expected);if(expected.length)assert.match(html,/disabled/);assert.doesNotMatch(html,/type="file"|Calendar|Unpublish|Reopen/);
});
test('waiting and revision context is escaped and bounded by layout class',()=>{
 for(const stage of ['waiting_for_recording','revision_requested']){const html=render({stage,stageContext:'<script>unsafe</script>\n'+'x'.repeat(1900)});assert.match(html,/bo-content-copy/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);}
});
