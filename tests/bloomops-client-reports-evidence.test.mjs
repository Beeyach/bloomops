import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reportBrowserError} from '../scripts/client-reports-evidence.mjs';
test('report browser receipts remove authentication URLs and token-bearing diagnostics',()=>{
 for(const message of ['page.goto: http://localhost:123/api/auth/magic-link/verify?token=synthetic-secret waiting','https://localhost:123/invite/synthetic-secret','request /callback?token=synthetic-secret&mode=qa','Bearer synthetic-secret','cookie: session=synthetic-secret; realm=qa','set-cookie: session=synthetic-secret; HttpOnly','Authorization: Basic synthetic-secret']){
  const safe=reportBrowserError(new Error(message));assert.doesNotMatch(safe,/synthetic-secret/);assert.match(safe,/redacted/i);
 }
});
test('report browser diagnostics retain nonsecret assertion and failure context',()=>{
 const message='Expected revision 2 but received 1\nSave conflict';assert.equal(reportBrowserError(new Error(message)),message);
});
