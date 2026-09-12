import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifiedProspectSocials} from '../lib/bloomops/prospect-socials.mjs';
const checked=(sourceUrl,fieldKey='businessName')=>({fieldKey,sourceUrl,verification:'checked',checkedAt:'2026-09-12T00:00:00Z'});
test('social links require checked business/person identity provenance',()=>{
 assert.deepEqual(verifiedProspectSocials(),[]);
 assert.deepEqual(verifiedProspectSocials([{...checked('https://instagram.com/studio.example'),verification:'unverified'}, {...checked('https://linkedin.com/in/person'),checkedAt:null},checked('https://instagram.com/another','observedFacts')]),[]);
});
test('keeps confirmed business/person profile links and removes tracking',()=>{
 assert.deepEqual(verifiedProspectSocials([checked('https://www.instagram.com/studio.example/?utm_source=site#bio'),checked('https://linkedin.com/in/maya-example/','personName')]),[
  {network:'instagram',url:'https://www.instagram.com/studio.example/',label:'Instagram business profile'},
  {network:'linkedin',url:'https://linkedin.com/in/maya-example/',label:'LinkedIn person profile'},
 ]);
 assert.equal(verifiedProspectSocials([checked('https://linkedin.com/company/studio-example/')])[0].network,'linkedin');
});
test('omits share, content, login and lookalike URLs even when present in sources',()=>{
 for(const url of ['https://instagram.com/p/123','https://instagram.com/reel/123','https://instagram.com/stories/studio','https://instagram.com/accounts','https://instagram.com/share','https://linkedin.com/sharing/share-offsite/?url=https://example.com','https://linkedin.com/feed/update/123','https://instagram.com.evil.test/studio','https://evil.test/instagram.com/studio','https://instagram.com:8080/studio','javascript:alert(1)','http://instagram.com/studio','https://user:pass@instagram.com/studio'])assert.deepEqual(verifiedProspectSocials([checked(url)]),[],url);
});
test('rechecking or invalidating a source changes link visibility without stale state',()=>{
 const source=checked('https://instagram.com/studio.example');assert.equal(verifiedProspectSocials([source]).length,1);
 assert.equal(verifiedProspectSocials([{...source,verification:'unverified',checkedAt:null}]).length,0);
 assert.equal(verifiedProspectSocials([source,source]).length,1);
});
