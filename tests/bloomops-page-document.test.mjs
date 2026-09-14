import {generateHTML} from '@tiptap/html/server';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import {Equation} from '../lib/editor-extensions.mjs';
import {renderEquation} from '../lib/equations-server.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderPageDocument} from '../lib/bloomops/page-document.mjs';
import {sanitizePublicHtml} from '../lib/sanitize-public-html.mjs';
import {renderEquationsForPublic} from '../lib/public-equations.mjs';
import {testDb,run} from './_bloomops-db.mjs';
import {createWorkspacePage,getWorkspacePage,saveWorkspacePage} from '../lib/bloomops/pages.mjs';
import {updatePageSharing} from '../lib/bloomops/page-sharing.mjs';
const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMc8AAAAASUVORK5CYII=';
const equation=latex=>'<div data-equation="" data-latex="'+latex+'" class="ltb-equation">'+latex+'</div>';
test('native toggle state and semantic formatting survive the authenticated reader',()=>{const src='<details data-toggle="" class="ltb-toggle" open><summary class="ltb-toggle-summary">Details</summary><div data-toggle-body="" class="ltb-toggle-body"><p><strong>Bold</strong> <em>Italic</em> <mark>Highlight</mark></p></div></details>';assert.equal(renderPageDocument(src),src.replaceAll('=""',''));assert.ok(!renderPageDocument(src.replace(' open','')).includes(' open'));});
test('legacy sanitizer defaults retain their existing behaviour',()=>{const src='<details open><summary>Title</summary><p>Text</p></details><img src="'+pixel+'"><div class="fixed">Copy</div>';const clean=sanitizePublicHtml(src);assert.ok(!clean.includes('<details'));assert.ok(!clean.includes('data:image'));assert.ok(clean.includes('class="fixed"'));});
test('responsive column configuration and callout tones survive without stored CSS',()=>{const out=renderPageDocument('<div data-columns="" data-count="4" class="ltb-columns fixed" style="position:fixed"><div data-column="" class="ltb-column"><div data-callout="" data-tone="success" class="ltb-callout"><p>Saved</p></div></div></div>');assert.ok(out.includes('data-count="4"'));assert.ok(out.includes('class="ltb-columns"'));assert.ok(out.includes('data-tone="success"'));assert.ok(!out.includes('style=')&&!out.includes('fixed'));});
test('strict inline raster sources stay only on images',()=>{assert.ok(renderPageDocument('<img src="'+pixel+'" alt="Pixel">').includes(pixel));assert.ok(!renderPageDocument('<a href="'+pixel+'">Bad link</a>').includes(pixel));assert.ok(!renderPageDocument('<div src="'+pixel+'">Bad source</div>').includes(pixel));});
for(const source of ['data:image/svg+xml;base64,PHN2Zy8+','data:text/html;base64,PHNjcmlwdD4=','data:image/png;base64,aaaa\" onerror=\"bad()','data:image/png;base64,abc','data:image/png;base64,AA==AA==','data:image/png;base64,'+'a'.repeat(1800000)])test('refuses unsupported or malformed inline source '+source.slice(0,45),()=>{const out=renderPageDocument('<img src="'+source+'">');assert.ok(!out.includes('src=')&&!out.includes('onerror'));});
test('raster capability does not permit events, frames, SVG, scripts or form controls',()=>{const out=renderPageDocument('<img src="'+pixel+'" onerror="bad()"><script>bad()</script><iframe src="https://example.test"></iframe><svg><script>bad()</script></svg><input type="text"><input type="checkbox" checked onclick="bad()"><a href="javascript:bad()">Link</a>');assert.ok(out.includes(pixel));assert.ok(!/script|iframe|svg|onerror|onclick|type="text"|javascript/.test(out));assert.ok(out.includes('<input type="checkbox" disabled checked>'));});
test('equations render only after author-written markup is sanitized',()=>{const out=renderPageDocument(equation('E=mc^2')+'<div class="katex" onclick="bad()"><script>bad()</script>Text</div>');assert.ok(out.includes('class="katex"'));assert.ok(!out.includes('onclick')&&!out.includes('<script'));assert.ok(out.endsWith('<div>Text</div>'));});
test('untrusted equation commands cannot fetch images or create active links',()=>{const out=renderPageDocument(equation('\\includegraphics{https://foreign.example/image.png}')+equation('\\href{javascript:bad()}{Click}'));assert.ok(!out.includes('<img')&&!out.includes('<a '));});
test('equation budget leaves readable source when limits are reached',()=>{const src=equation('x'),out=renderEquationsForPublic(src+src,{maxEquations:1,maxSourceLength:10});assert.equal((out.match(/class="katex"/g)||[]).length,1);assert.ok(out.endsWith(src));assert.equal(renderEquationsForPublic(equation('x'.repeat(11)),{maxSourceLength:10}),equation('x'.repeat(11)));assert.equal((renderPageDocument(src.repeat(31)).match(/class="katex"/g)||[]).length,30);});
test('inert bookmarks stay links and never initiate embedded providers',()=>{const src='<div data-embed="" data-provider="figma" data-url="https://www.figma.com/file/example/Design" class="ltb-embed"><a href="https://www.figma.com/file/example/Design">Design reference</a></div>';const out=renderPageDocument(src);assert.ok(out.includes('Design reference')&&out.includes('https://www.figma.com'));assert.ok(!out.includes('<iframe'));});
test('authorized reader derives markup without modifying source, revision or editor content',async ctx=>{const {raw,db}=testDb();ctx.after(()=>raw.close());run(raw,"INSERT INTO workspaces(id,name,slug) VALUES('w','Studio','studio')");for(const role of ['owner','team_member']){run(raw,'INSERT INTO user(id,name,email) VALUES(?,?,?)',role,role,role+'@example.test');run(raw,"INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(?,'w',?,?,'active')",role,role,role);}const owner={workspaceId:'w',membershipId:'owner',userId:'owner',role:'owner',status:'active'},viewer={workspaceId:'w',membershipId:'team_member',userId:'team_member',role:'team_member',status:'active'};const {id}=await createWorkspacePage(db,owner,{workspaceId:'w',requestId:crypto.randomUUID(),parentId:null,expectedTreeRevision:0});const body=equation('x^2')+'<img src="'+pixel+'">';assert.ok((await saveWorkspacePage(db,owner,id,{workspaceId:'w',expectedRevision:1,title:'Guide',body})).ok);assert.equal(await getWorkspacePage(db,viewer,id),null);assert.ok((await updatePageSharing(db,owner,id,{workspaceId:'w',expectedTreeRevision:1,kind:'grant',membershipId:'team_member',permission:'view'})).ok);const shown=await getWorkspacePage(db,viewer,id);assert.ok(shown.body.includes('class="katex"')&&shown.body.includes(pixel));assert.equal(shown.revision,2);assert.equal((await getWorkspacePage(db,owner,id)).body,body);run(raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='team_member'");assert.equal(await getWorkspacePage(db,viewer,id),null);assert.equal(raw.prepare('SELECT body FROM bloomops_pages WHERE id=?').get(id).body,body);});

for(const latex of ['x > y','x < y',String.raw`\begin{matrix}a & b\end{matrix}`,String.raw`\text{a "quote" and \& b}`])test('real editor serialization preserves equation semantics: '+latex,()=>{
 const stored=generateHTML({type:'doc',content:[{type:'equation',attrs:{latex}}]},[Document,Paragraph,Text,Equation]);
 assert.equal(renderPageDocument(stored),'<div class="ltb-equation" data-equation>'+renderEquation(latex,{display:true}).html+'</div>');
});
test('quote-aware document scanning keeps executable attributes denied',()=>{
 const out=renderPageDocument(`<p title="x > y">Safe</p><img alt='a > b' onerror="bad()"><a href="javascript:bad()" title="a > b">Safe link</a>`);
 assert.ok(out.includes('title="x &gt; y"'));assert.ok(out.includes('Safe link'));assert.ok(!/onerror|javascript|href=/.test(out));
 assert.equal(renderPageDocument('<p title="unterminated > text'),'');
});
test('serialized numeric equation entities decode at the inert source boundary only',()=>{
 const out=renderPageDocument('<div data-equation data-latex="x &#62; y"><code>x &gt; y</code></div>');
 assert.equal(out,'<div class="ltb-equation" data-equation>'+renderEquation('x > y',{display:true}).html+'</div>');
 assert.ok(!renderPageDocument('<a href="jav&#97;script:bad()">Inert</a>').includes('href="javascript:'));
});
