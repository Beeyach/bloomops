import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageLinkRows} from '../lib/editor-page-links.mjs';
test('page links use explicit workspace context and only display metadata',()=>{
 assert.deepEqual(pageLinkRows([{id:'page-a',title:'Client guide',body:'private source',parent_id:'private-parent'}],'workspace-a'),[{key:'page-page-a',icon:'file',label:'Client guide',href:'/shared-pages/page-a?workspace=workspace-a'}]);
});
test('matching searches all supplied authorized metadata before limiting suggestions',()=>{
 const rows=Array.from({length:20},(_,i)=>({id:'page-'+i,title:'Guide '+i}));assert.equal(pageLinkRows(rows,'workspace-a').length,8);assert.equal(pageLinkRows(rows,'workspace-a','  GUIDE 19 ')[0].label,'Guide 19');assert.deepEqual(pageLinkRows(rows,'workspace-a','missing'),[]);
});
test('invalid identifiers cannot create a foreign destination or active URL',()=>{
 for(const id of ['',null,'https://foreign.example','../target','a?workspace=foreign','a#fragment'])assert.deepEqual(pageLinkRows([{id:'valid',title:'Title'}],id),[]);
 assert.deepEqual(pageLinkRows([{id:'../foreign'},null,{id:'valid',title:''}],'workspace'),[{key:'page-valid',icon:'file',label:'Untitled',href:'/shared-pages/valid?workspace=workspace'}]);
});

test('typing at a page link boundary does not inherit the link after reload',async()=>{
 const {getSchema}=await import('@tiptap/core'),{default:StarterKit}=await import('@tiptap/starter-kit'),{pageLinkStarterKit}=await import('../lib/editor-page-links.mjs');
 for(const [kit,expected] of [[StarterKit,true],[pageLinkStarterKit,false]]){
  const schema=getSchema([kit]),link=schema.mark('link',{href:'/shared-pages/a?workspace=b'}),bold=schema.mark('bold'),doc=schema.node('doc',null,[schema.node('paragraph',null,schema.text('Guide',[link,bold]))]);
  const at=doc.resolve(6);assert.equal(at.marks().some(m=>m.type.name==='link'),expected);assert.equal(at.marks().some(m=>m.type.name==='bold'),true);
 }
});
