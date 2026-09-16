import './_jsx.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const {WorkTabs}=await import('../components/bloomops/Actions.jsx');
const {default:TeamNavigation}=await import('../components/bloomops/TeamNavigation.jsx');
const {default:ContentPlatformFilter}=await import('../components/bloomops/ContentPlatformFilter.jsx');
const {EmptyState}=await import('../components/bloomops/Primitives.jsx');
const render=(C,p)=>renderToStaticMarkup(React.createElement(C,p));
test('Work and Team retain ordinary route links and exactly one compact current destination',()=>{
 for(const [C,props,href] of [[WorkTabs,{active:'projects'},'/work?tab=projects'],[TeamNavigation,{active:'workload'},'/team/workload']]){
  const html=render(C,props);assert.match(html,/bo-view-nav/);assert.doesNotMatch(html,/bo-tabs|role="tab"/);assert.equal((html.match(/aria-current="page"/g)||[]).length,1);assert.ok(html.includes('href="'+href+'"'));assert.match(html,/class="bo-btn"/);
 }
});
test('Platform selector preserves All, current legacy labels and another-platform recovery without adding a provider catalogue',()=>{
 const html=render(ContentPlatformFilter,{id:'platform',value:'__custom__',choices:[{key:'instagram',label:'Instagram'}]});
 assert.match(html,/platform:instagram/);assert.match(html,/value="platform:__custom__" selected/);assert.match(html,/name="platform" value="__custom__"/);assert.match(html,/Another platform/);assert.match(html,/>All</);assert.doesNotMatch(html,/Facebook|Connected|verified/i);
});
test('Empty icon is supplementary and preserves recovery text/action',()=>{
 const html=render(EmptyState,{title:'No matching records',children:'Clear these filters.',actions:React.createElement('a',{href:'/work'},'Clear filters')});
 assert.match(html,/bo-empty-icon/);assert.match(html,/aria-hidden="true"/);assert.match(html,/Clear these filters/);assert.match(html,/href="\/work"/);
});
