import './_jsx.mjs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const {ContentList}=await import('../components/bloomops/ContentViews.jsx');
const {default:ContentCalendar}=await import('../components/bloomops/ContentCalendar.jsx');
const {AdsCreativeList}=await import('../components/bloomops/AdsCreative.jsx');
const render=(C,p)=>renderToStaticMarkup(React.createElement(C,p));
const options={parents:[],members:[]};
test('empty first Social page has recovery but no inert pagination',()=>{
 const html=render(ContentList,{result:{items:[],page:1,hasMore:false},options});
 assert.doesNotMatch(html,/aria-label="Content pages"/);
 assert.match(html,/No Content here yet/);assert.match(html,/href="\/social\/new"/);
});
test('filtered empty Social and out-of-range pages have distinct recovery',()=>{
 const html=render(ContentList,{result:{items:[],page:3,hasMore:false},query:{stage:'idea',page:'3'},options});
 assert.match(html,/No Content matches these filters/);assert.match(html,/Previous page/);assert.match(html,/stage=idea&amp;page=2/);
 const past=render(ContentList,{result:{items:[],page:3,hasMore:false},query:{page:'3'},options});assert.match(past,/No Content on this page/);assert.match(past,/First page/);
});
test('empty Calendar retains month navigation but omits inert result pagination',()=>{
 const html=render(ContentCalendar,{result:{items:[],page:1,hasMore:false},options,month:{month:'2026-09',previous:'2026-08',next:'2026-10'}});
 assert.match(html,/Calendar months/);assert.doesNotMatch(html,/aria-label="Calendar pages"/);
});
test('empty Ads creative omits inert pagination and preserves out-of-range recovery',()=>{
 const facets=Object.fromEntries(['projectId','clientId','serviceEngagementId','ownerMembershipId','platform'].map(k=>[k,{items:[]}]))
 const html=render(AdsCreativeList,{result:{items:[],page:1,hasMore:false,filters:{}},facets});assert.doesNotMatch(html,/aria-label="Creative pages"/);
 const past=render(AdsCreativeList,{result:{items:[],page:2,hasMore:false,filters:{}},facets});assert.match(past,/Previous page/);
});
