import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {verifyZero} from '../.github/scripts/verify-zero-remote.mjs';
import {verifierFixture} from './_zero-verifier-fixture.mjs';

async function scenario(c,options={}) {
 const fixture=await verifierFixture(options),root=mkdtempSync(join(tmpdir(),'zero-verifier-test-')),path=join(root,'summary.json'),logs=[];
 c.after(()=>{fixture.close();rmSync(root,{recursive:true,force:true});});
 const outcome=await verifyZero({execute:fixture.execute,diagnostic:!options.normal,summaryPath:path,logger:{log:x=>logs.push(x),error:x=>logs.push(x)}});
 assert.deepEqual(JSON.parse(readFileSync(path,'utf8')),outcome);
 assert.ok(logs.some(x=>x.startsWith('ZERO_VERIFY_SUMMARY ')));
 return {fixture,outcome,logs};
}
test('successful verifier retains compact durable first/integrity/repeat/cleanup evidence',async c=>{
 const {outcome,fixture}=await scenario(c);assert.equal(outcome.exitCode,0);assert.equal(outcome.firstPass,'passed');assert.equal(outcome.integrity,'passed');assert.equal(outcome.repeatPass,'passed');assert.equal(outcome.cleanup,'absent');assert.equal(fixture.passes,2);assert.ok(fixture.deleted);
});
test('SQLITE_NOMEM remains non-passing while independent repeat pass and cleanup finish',async c=>{
 const {outcome,fixture}=await scenario(c,{integrity:'nomem'});assert.equal(outcome.exitCode,1);assert.equal(outcome.firstPass,'passed');assert.equal(outcome.integrity,'uncompleted');assert.equal(outcome.repeatPass,'passed');assert.equal(outcome.cleanup,'absent');assert.equal(outcome.diagnostics.at(-1).status,'error');assert.equal(fixture.passes,2);
});
test('normal verification performs no extra diagnostic and stops repeat after an integrity error',async c=>{const {outcome,fixture}=await scenario(c,{normal:true,integrity:'nomem'});assert.equal(outcome.exitCode,1);assert.equal(outcome.integrity,'uncompleted');assert.equal(outcome.repeatPass,'not_run');assert.deepEqual(outcome.diagnostics,[]);assert.equal(outcome.cleanup,'absent');assert.equal(fixture.passes,1);});
for(const integrity of ['finding','malformed'])test(integrity+' never becomes a passing integrity result',async c=>{
 const {outcome,fixture}=await scenario(c,{integrity});assert.equal(outcome.exitCode,1);assert.equal(outcome.integrity,integrity==='finding'?'finding':'uncompleted');assert.equal(outcome.repeatPass,'not_run');assert.equal(outcome.cleanup,'absent');assert.equal(fixture.passes,1);
});
for(const key of ['firstFailure','repeatFailure','deleteFailure','inventoryChanged'])test(key+' preserves failure and explicit cleanup outcome',async c=>{
 const {outcome}=await scenario(c,{[key]:true});assert.equal(outcome.exitCode,1);assert.equal(outcome.cleanup,key==='deleteFailure'?'unconfirmed':'absent');
 if(key==='firstFailure'){assert.equal(outcome.firstPass,'failed');assert.equal(outcome.integrity,'not_run');}
 if(key==='repeatFailure')assert.equal(outcome.repeatPass,'failed');
 if(key==='inventoryChanged')assert.notDeepEqual(outcome.inventoryBefore,outcome.inventoryAfter);
});
for(const key of ['preexisting','replaced','renamed'])test(key+' identity prevents deletion',async c=>{
 const {outcome,fixture}=await scenario(c,{[key]:true});assert.equal(outcome.exitCode,1);assert.equal(fixture.deleted,false);assert.ok(!fixture.calls.some(x=>x[3]==='delete'));
});
test('an inventory error after CREATE still cleans up only its pinned identity',async c=>{const {outcome,fixture}=await scenario(c,{afterCreateInventoryFailure:true});assert.equal(outcome.exitCode,1);assert.equal(outcome.cleanup,'absent');assert.equal(fixture.passes,0);assert.ok(fixture.deleted);});
for(const key of ['createFailure','missingCreateId'])test(key+' cannot guess resource ownership or claim cleanup',async c=>{const {outcome,fixture}=await scenario(c,{[key]:true});assert.equal(outcome.exitCode,1);assert.equal(fixture.deleted,false);assert.ok(['creation_unconfirmed','unconfirmed'].includes(outcome.cleanup));});
test('CLI drains piped output and preserves failure exit plus final cleanup summary',async()=>{
 const script=`import child from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';import {verifierFixture} from './tests/_zero-verifier-fixture.mjs';
 const fixture=await verifierFixture({integrity:'nomem'});child.execFileSync=fixture.execute;syncBuiltinESMExports();
 process.stdout.write('x'.repeat(256*1024));process.stderr.write('y'.repeat(256*1024));
 process.argv=[process.execPath,process.cwd()+'/.github/scripts/verify-zero-remote.mjs','--diagnose-bytecode'];
 await import('./.github/scripts/verify-zero-remote.mjs');fixture.close();`;
 await assert.rejects(promisify(execFile)(process.execPath,['--input-type=module','-e',script],{maxBuffer:2*1024*1024}),err=>{
  assert.equal(err.code,1);assert.ok(err.stdout.startsWith('x'.repeat(256*1024)));assert.ok(err.stderr.includes('y'.repeat(256*1024)));
  const line=err.stdout.split('\n').find(x=>x.startsWith('ZERO_VERIFY_SUMMARY '));const result=JSON.parse(line.slice('ZERO_VERIFY_SUMMARY '.length));assert.equal(result.cleanup,'absent');assert.equal(result.integrity,'uncompleted');assert.equal(result.exitCode,1);return true;
 });
});
