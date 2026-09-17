import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PROSPECT_FIELDS} from '../lib/bloomops/prospect-values.mjs';
import {createProfileDraftStore,profileDraftValue,profileDraftDirty,chosenProfileSources,profileDraftScope,PROFILE_DRAFT_TTL} from '../lib/bloomops/profile-drafts.mjs';
import {changeDraftContext,DRAFT_CONTEXT_KEY,SHEET_DRAFT_PREFIX} from '../lib/bloomops/draft-context.mjs';
const scope={userId:'user-a',workspaceId:'workspace-a',prospectId:'prospect-a'},clock=1000000000;
const storage=()=>{const values={};return new Proxy({getItem:k=>values[k]??null,setItem:(k,v)=>{values[k]=String(v);},removeItem:k=>{delete values[k];}},{ownKeys:()=>Object.keys(values),getOwnPropertyDescriptor:(_,k)=>Object.hasOwn(values,k)?{enumerable:true,configurable:true}:undefined});};
function draft(section='identity'){const fields=Object.fromEntries(Object.entries(PROSPECT_FIELDS).filter(([,s])=>s.section===section).map(([k])=>[k,k==='businessName'?'Garden':k==='fit'?'unknown':null]));return {section,revision:7,before:fields,fields:{...fields,[Object.keys(fields)[0]]:'Unfinished draft'},sources:{},sourceBefore:{}};}
test('independent writers retain incomplete profile values and original revision within their own scope',()=>{
 const s=storage(),a=createProfileDraftStore(s,scope,'tab-a',()=>clock),b=createProfileDraftStore(s,scope,'tab-b',()=>clock),value=draft();value.fields.website='https://';a.write(value);b.write({...value,fields:{...value.fields,businessName:'Other tab'}});
 assert.equal(a.list().length,2);assert.equal(a.snapshot(a.own).value.revision,7);assert.equal(a.snapshot(a.own).value.fields.website,'https://');
 for(const patch of [{userId:'user-b'},{workspaceId:'workspace-b'},{prospectId:'prospect-b'}]){const other=createProfileDraftStore(s,{...scope,...patch},'tab-a',()=>clock);assert.deepEqual(other.list(),[]);assert.equal(other.snapshot(a.own),null);assert.equal(other.remove(a.own),false);}
});
test('source controls retain original provenance and only explicitly changed checks are selected',()=>{
 const value=draft();value.fields={...value.before};value.sourceBefore.website={url:'https://garden.example',verification:'checked',checkedAt:'2026-09-14',updatedAt:'2026-09-14'};value.sources.website={url:'https://garden.example',checked:false,touched:false};assert.equal(profileDraftDirty(value),false);assert.deepEqual(chosenProfileSources(value),{});
 value.sources.website.checked=true;assert.deepEqual(chosenProfileSources(value),{website:{url:'https://garden.example',checked:true}});assert.equal(profileDraftDirty(value),true);
 const s=storage(),a=createProfileDraftStore(s,scope,'tab',()=>clock);a.write(value);assert.deepEqual(a.snapshot(a.own).value.sourceBefore,value.sourceBefore);
});
test('malformed, foreign-section and oversize fields cannot be recovered',()=>{
 const value={...draft(),...scope,version:1,id:'tab',updatedAt:clock};assert.ok(profileDraftValue(value,scope,clock));
 for(const patch of [{userId:'other'},{prospectId:'other'},{revision:0},{section:'invented'},{updatedAt:clock+60001},{fields:{...value.fields,businessName:'x'.repeat(181)}},{fields:{...value.fields,draftBody:'foreign section'}},{sources:{website:{url:'x',checked:'yes',touched:true}}}])assert.equal(profileDraftValue({...value,...patch},scope,clock),null);
 const s=storage(),a=createProfileDraftStore(s,scope,'tab',()=>clock);s.setItem(a.own,JSON.stringify({...value,padding:'花'.repeat(90000)}));assert.equal(a.snapshot(a.own),null);
});
test('expiry physically removes only expired copies for this prospect',()=>{
 const s=storage(),a=createProfileDraftStore(s,scope,'old',()=>clock),other=createProfileDraftStore(s,{...scope,prospectId:'other'},'old',()=>clock);a.write(draft());other.write(draft());
 const later=createProfileDraftStore(s,scope,'new',()=>clock+PROFILE_DRAFT_TTL+1);assert.deepEqual(later.list(),[]);assert.equal(s.getItem(a.own),null);assert.ok(s.getItem(other.own));
});
test('copy limit retains existing values and conditional deletion preserves concurrent changes',()=>{
 const s=storage(),writers=Array.from({length:10},(_,i)=>createProfileDraftStore(s,scope,'tab'+i,()=>clock));for(const w of writers)w.write(draft());const next=createProfileDraftStore(s,scope,'new',()=>clock);assert.throws(()=>next.write(draft()),/Ten recovery copies/);assert.equal(next.list().length,10);
 const original=writers[0],checked=next.snapshot(original.own);original.write({...draft(),revision:8});assert.equal(next.remove(original.own,checked.raw),false);assert.equal(original.snapshot(original.own).value.revision,8);assert.equal(next.remove(original.own,s.getItem(original.own)),true);
});
test('context changes and disposal prevent old editors from recreating a draft',()=>{
 const s=storage(),a=createProfileDraftStore(s,scope,'a',()=>clock);a.write(draft());s.setItem(DRAFT_CONTEXT_KEY,'changed');assert.equal(a.valid(),false);assert.equal(a.write(draft()),false);assert.deepEqual(a.list(),[]);
 const b=createProfileDraftStore(s,scope,'b',()=>clock);b.dispose();assert.equal(b.write(draft()),false);assert.equal(s.getItem(b.own),null);
});
test('failed storage never claims the recovery copy was kept',()=>{
 const s=storage(),a=createProfileDraftStore(s,scope,'tab',()=>clock);s.setItem=()=>{throw Error('Quota exceeded');};assert.throws(()=>a.write(draft()),/Quota/);assert.equal(a.snapshot(a.own),null);
});
test('logout clears profile and sheet copies while retaining unrelated browser preferences',()=>{
 const s=storage(),a=createProfileDraftStore(s,scope,'tab',()=>clock);a.write(draft());s.setItem(SHEET_DRAFT_PREFIX+'old','old');s.setItem('unrelated','keep');const oldStorage=globalThis.localStorage,oldWindow=globalThis.window;
 try{globalThis.localStorage=s;globalThis.window={dispatchEvent(){}};changeDraftContext({logout:true});assert.equal(s.getItem(a.own),null);assert.equal(s.getItem(SHEET_DRAFT_PREFIX+'old'),null);assert.equal(s.getItem('unrelated'),'keep');assert.equal(a.valid(),false);}finally{if(oldStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=oldStorage;if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;}
});
test('checking a manually entered field without a source URL keeps a valid copy',()=>{
 const s=storage(),a=createProfileDraftStore(s,scope,'tab',()=>clock),value=draft();value.fields={...value.before};value.sources.businessName={checked:true,touched:true};a.write(value);
 assert.deepEqual(a.snapshot(a.own).value.sources.businessName,{url:'',checked:true,touched:true});assert.equal(profileDraftDirty(a.snapshot(a.own).value),true);
});

test('focused contact recovery retains only its explicit fields and provenance within existing scope guards',()=>{
 const s=storage(),store=createProfileDraftStore(s,scope,'contact-tab',()=>clock);
 const input={section:'identity',fieldSet:'primary_contact',revision:7,before:{personName:null,publicEmail:'qa@example.test'},fields:{personName:'QA contact',publicEmail:'qa@example.test'},sources:{publicEmail:{url:'https://example.test',checked:false,touched:false}},sourceBefore:{publicEmail:{url:'https://example.test',verification:'checked',checkedAt:null,updatedAt:null}}};
 store.write(input);const saved=store.snapshot(store.own).value;assert.deepEqual(Object.keys(saved.fields),['personName','publicEmail']);assert.deepEqual(chosenProfileSources(saved),{});assert.equal(saved.sourceBefore.publicEmail.verification,'checked');
 assert.throws(()=>store.write({...input,fields:{...input.fields,businessName:'Hidden change'}}));assert.throws(()=>store.write({...input,fieldSet:'invented'}));assert.throws(()=>store.write({...input,fieldSet:undefined}));
 s.setItem(DRAFT_CONTEXT_KEY,'different');assert.equal(store.valid(),false);assert.equal(store.snapshot(store.own),null);
});
