import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './_prospect-conversion-fixture.mjs';
import {all,run} from './_bloomops-db.mjs';
import {readProfileRecovery} from '../lib/bloomops/profile-recovery.mjs';
import {updateProspect,createProspect} from '../lib/bloomops/prospects.mjs';
import {profileRetryPlan} from '../lib/bloomops/profile-retry.mjs';
test('profile recovery binds identity/workspace and reads without application writes',async c=>{
 const t=await fixture(c),input={userId:t.actor.userId,workspaceId:'w'},before=all(t.raw,'SELECT * FROM activity_events');
 const result=await readProfileRecovery(t.db,t.actor,t.id,input);assert.equal(result.status,200);assert.equal(result.profile.id,t.id);assert.deepEqual(all(t.raw,'SELECT * FROM activity_events'),before);
 for(const patch of [{userId:'other'},{workspaceId:'other'}])assert.equal((await readProfileRecovery(t.db,t.actor,t.id,{...input,...patch})).status,403);
 assert.equal((await readProfileRecovery(t.db,t.actor,'missing',input)).status,404);
 assert.equal((await readProfileRecovery(t.db,t.actor,t.id,{...input,fields:{}})).status,400);
});
test('recovery and identity-bound saves reject revoked membership and replaced user',async c=>{
 const t=await fixture(c),input={userId:t.actor.userId,workspaceId:'w'};
 const denied=await updateProspect(t.db,{actor:t.actor,id:t.id,input:{...input,userId:'other',expectedRevision:1,fields:{businessName:'Wrong account'}}});assert.equal(denied.ok,false);
 run(t.raw,'UPDATE workspace_memberships SET status=? WHERE id=?','suspended',t.actor.membershipId);
 assert.equal((await readProfileRecovery(t.db,t.actor,t.id,input)).status,404);
 assert.equal((await updateProspect(t.db,{actor:t.actor,id:t.id,input:{...input,expectedRevision:1,fields:{businessName:'Revoked'}}})).ok,false);
});
test('lost response checks values and provenance without adopting a newer revision',()=>{
 const draft={revision:2,fields:{businessName:'Garden new'},before:{businessName:'Garden old'},sources:{},sourceBefore:{businessName:{url:'https://example.test/',verification:'checked'}}};
 const current={profile:{revision:2,businessName:'Garden old'},sources:[]};assert.equal(profileRetryPlan(draft,current).state,'ready');
 current.profile={revision:3,businessName:'Concurrent edit'};assert.equal(profileRetryPlan(draft,current).state,'conflict');
 current.profile.businessName='Garden new';assert.equal(profileRetryPlan(draft,current).state,'conflict','matching text alone cannot confirm changed provenance');
 current.sources=[{fieldKey:'businessName',sourceUrl:'https://example.test/',verification:'unverified'}];assert.equal(profileRetryPlan(draft,current).state,'saved');
 draft.sources.businessName={url:'https://new.example/',checked:true,touched:true};assert.equal(profileRetryPlan(draft,current).state,'conflict');current.sources=[{fieldKey:'businessName',sourceUrl:'https://new.example/',verification:'checked'}];assert.equal(profileRetryPlan(draft,current).state,'saved');
 draft.fields.businessName='';assert.equal(profileRetryPlan(draft,current).state,'invalid');
});
test('revocation during the profile read is checked again before revealing a recovery copy',async c=>{
 const t=await fixture(c),batch=t.d1.batch.bind(t.d1);let revoke=true;t.d1.batch=async statements=>{if(revoke){revoke=false;run(t.raw,'UPDATE workspace_memberships SET status=? WHERE id=?','suspended',t.actor.membershipId);}return batch(statements);};
 const result=await readProfileRecovery(t.db,t.actor,t.id,{userId:t.actor.userId,workspaceId:'w'});assert.equal(result.status,404);assert.equal(result.profile,undefined);
});
test('foreign existing prospects and current non-manager roles cannot reveal recovery data or change records',async c=>{
 const t=await fixture(c);run(t.raw,"INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES('foreign-member','foreign','owner','owner','active')");const foreign=await createProspect(t.db,{actor:{...t.actor,workspaceId:'foreign',membershipId:'foreign-member'},input:{workspaceId:'foreign',requestId:crypto.randomUUID(),fields:{businessName:'Foreign garden'}}});assert.ok(foreign.ok);
 const before=t.snapshot();assert.equal((await readProfileRecovery(t.db,t.actor,foreign.prospectId,{userId:'owner',workspaceId:'w'})).status,404);assert.deepEqual(t.snapshot(),before);
 for(const role of ['team_member','project_manager','client']){run(t.raw,'UPDATE workspace_memberships SET role=? WHERE id=?',role,'m');const snapshot=t.snapshot();assert.equal((await readProfileRecovery(t.db,t.actor,t.id,{userId:'owner',workspaceId:'w'})).status,404);assert.deepEqual(t.snapshot(),snapshot);}
});
