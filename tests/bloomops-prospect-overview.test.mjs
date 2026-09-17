import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mailboxFixture} from './_prospect-mailbox-fixture.mjs';
import {prospectAutomationState,prospectCoverageCopy,prospectCoverageOverview,prospectExceptionCopy} from '../lib/bloomops/prospect-overview.mjs';

test('automation remains unconfigured or inactive without inferring activity from a connection',()=>{
 assert.deepEqual(prospectAutomationState({sender:null,connection:{configured:true,hasStoredGrant:true}}),{state:'unconfigured',label:'Automation is unconfigured'});
 assert.deepEqual(prospectAutomationState({sender:{email:'hello@example.test'},connection:{configured:false,hasStoredGrant:true}}),{state:'unconfigured',label:'Automation is unconfigured'});
 assert.deepEqual(prospectAutomationState({sender:{email:'hello@example.test'},connection:{configured:true,hasStoredGrant:true,connected:true}}),{state:'inactive',label:'Automation is inactive'});
});

test('exception copy exposes recorded stop evidence and distinct held reasons',()=>{
 assert.deepEqual(prospectExceptionCopy({holdState:'stopped',stopReason:'manual',stopNote:'Owner paused this account.'}),{key:'stopped:manual',label:'Stopped after manual review',detail:'Owner paused this account.'});
 assert.equal(prospectExceptionCopy({holdState:'held',checkStatus:'unresolved'}).label,'Conversation check could not be resolved');
 assert.equal(prospectExceptionCopy({holdState:'held',checkStatus:'checked'}).label,'Reply or delivery evidence needs review');
});

test('coverage read distinguishes unknown, unverified and recorded gaps under current authority',async c=>{
 const t=await mailboxFixture(c);let data=await prospectCoverageOverview(t.db,t.actor,'hello@example.test');assert.deepEqual(data,{status:'unknown',checkStatus:null,lastReason:null});
 await t.mailcheck();data=await prospectCoverageOverview(t.db,t.actor,'hello@example.test');assert.equal(data.status,'unverified');assert.equal(prospectCoverageCopy(data).label,'Historical mailbox coverage is unverified');
 const gap=await mailboxFixture(c,{registered:false});await gap.mailcheck();data=await prospectCoverageOverview(gap.db,gap.actor,'hello@example.test');assert.equal(data.status,'gap');assert.equal(data.lastReason,'identity_required');assert.match(prospectCoverageCopy(data).detail,/identity required/);
 assert.equal(await prospectCoverageOverview(t.db,{...t.actor,role:'client'},'hello@example.test'),null);
 assert.deepEqual(await prospectCoverageOverview(t.db,{...t.actor,workspaceId:'foreign',membershipId:'other'},'hello@example.test'),{status:'unknown',checkStatus:null,lastReason:null});
});
