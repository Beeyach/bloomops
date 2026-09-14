import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewDocument } from '../lib/bloomops/preview-links.mjs';
const base='/client-preview/client/contact',api='/api/bloomops/client-preview/client/contact';
const render=body=>previewDocument(body,base,api);
test('authored Page/file links remain inside preview authorization',()=>{
  const html=render('<a href="/portal/pages/abc">Guide</a><img src="/api/bloomops/files/secret/download" alt="Brief"><a href="/api/bloomops/files/abc/download">File</a>');
  assert.ok(html.includes(`href="${base}/pages/abc"`));assert.ok(html.includes(`src="${api}/files/secret"`));assert.ok(html.includes(`href="${api}/files/abc"`));
});
test('links cannot escape to staff APIs, encoded authority, remote actions or media',()=>{
  for(const url of ['/api/auth/sign-out','//example.com/action','https://staging.ops.gobloomwired.com/api/bloomops/files/secret/download','javascript:alert(1)','/portal/pages/abc?share=true','/api/bloomops/files/abc/download?unsafe=true','&#x2f;&#x2f;example.com','/\\example.com','/portal/pages/../secret']){
    const html=render(`<a href="${url}">Link</a><img src="${url}" alt="Image">`);
    assert.doesNotMatch(html,/href=|src=/,url);
  }
});
test('safe reader formatting, anchors, inline raster and inert checklist remain',()=>{
  const html=render('<h2 id="intro">Guide</h2><a href="#intro">Introduction</a><input type="checkbox"><img src="data:image/png;base64,iVBORw0KGgo=" alt="Inline image"><script>alert(1)</script>');
  assert.ok(html.includes('href="#intro"'));assert.ok(html.includes('disabled'));assert.ok(html.includes('data:image/png'));assert.doesNotMatch(html,/<script/);
});
