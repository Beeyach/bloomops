import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { renderToStaticMarkup } from 'react-dom/server';
import { setup } from './_ads.mjs';
import { run } from './_bloomops-db.mjs';
globalThis.AsyncLocalStorage ??= AsyncLocalStorage;
const { workAsyncStorage } = await import('next/dist/server/app-render/work-async-storage.external.js');
const { workUnitAsyncStorage } = await import('next/dist/server/app-render/work-unit-async-storage.external.js');
const { getURLFromRedirectError } = await import('next/dist/client/components/redirect.js');
const { default: Page } = await import('../app/(internal)/ads/page.jsx');
const { default: ErrorView } = await import('../app/(internal)/ads/error.jsx');
async function fixture(context, user = 'ellen') {
  const t = await setup({ auth:true }); context.after(()=>t.raw.close());
  const cookie = user ? (await t.signIn(`${user}@example.com`)).cookie : '';
  t.render = query => {
    globalThis[Symbol.for('__cloudflare-context__')] = { env:t.env, cf:{}, ctx:{} };
    return workAsyncStorage.run({ route:'/ads' },()=>workUnitAsyncStorage.run({ type:'request',phase:'render',headers:new Headers({cookie}) },()=>Page({ searchParams:Promise.resolve(query) })));
  };
  return t;
}
test('real Ads page exposes bounded canonical links, readable summaries and labelled native filters', async context => {
  const t=await fixture(context); t.tree('launch');
  const html=renderToStaticMarkup(await t.render({}));
  assert.equal((html.match(/<h1\b/g)||[]).length,1);
  assert.match(html,/href="\/work\/projects\/launch"/); assert.match(html,/href="\/work\/projects\/new"/);
  for(const label of ['Client','Service','Project status']) assert.ok(html.includes(`>${label}</label>`));
  for(const section of ['milestones','actions','deliverables','files']) assert.ok(html.includes(`/work/projects/launch#project-${section}-title`));
  assert.doesNotMatch(html,/SECRET_KEY|Course blueprint|password|GHL builds/);
});
for(const query of [{ page:'0' }, { clientId:'foreign-client' }, { status:['active','all'] }]) test(`query failure keeps heading, safe alert and reset: ${JSON.stringify(query)}`,async context=>{
  const t=await fixture(context); const html=renderToStaticMarkup(await t.render(query));
  assert.equal((html.match(/<h1\b/g)||[]).length,1); assert.match(html,/role="alert"/); assert.match(html,/href="\/ads"/);
  assert.doesNotMatch(html,/Campaign launch|Retargeting delivery|foreign-client/);
});
for(const [user,to] of [[null,'/sign-in'],['james','/portal']]) test(`shell authorizes ${user||'anonymous'} before invalid query rendering`,async context=>{
  const t=await fixture(context,user); await assert.rejects(t.render({page:'0'}),e=>getURLFromRedirectError(e)===to);
});
test('issued Team session cannot turn Action-only scope into parent summaries and is revoked by suspension',async context=>{
  const t=await fixture(context,'sam'); t.action('own',{project_id:'launch',assignee_membership_id:'m-sam'});
  const html=renderToStaticMarkup(await t.render({}));
  assert.match(html,/No campaign work in this view/); assert.doesNotMatch(html,/Campaign launch|Retargeting delivery|Create project in Work|ads-deliverables-title/);
  run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='m-sam'");
  await assert.rejects(t.render({}),e=>getURLFromRedirectError(e)==='/sign-in');
});
test('error recovery preserves orientation without serializing the thrown error',()=>{
  const error=renderToStaticMarkup(ErrorView({reset:()=>{},error:new Error('PRIVATE_SQL')}));
  assert.equal((error.match(/<h1\b/g)||[]).length,1);
  assert.match(error,/<h1[^>]*>Ads/); assert.match(error,/role="alert"/); assert.match(error,/Try again/);
  assert.match(error,/href="\/ads"/);
  assert.doesNotMatch(error,/PRIVATE_SQL/);
});


test('Ads structured summary keeps canonical links and separates progress/review facts into badges', async context=>{
  const t=await fixture(context);t.tree('launch');
  const html=renderToStaticMarkup(await t.render({}));
  const summary=html.match(/<ul class="bo-work-summary bo-work-summary-structured"[^>]*>([\s\S]*?)<\/ul>/)?.[1];
  assert.ok(summary);assert.doesNotMatch(summary,/·/);
  assert.match(summary,/bo-status-success/);assert.match(summary,/bo-status-warning/);
  assert.match(summary,/100%/);assert.match(summary,/1 in Client Review/);
  for(const subject of ['milestones','actions','deliverables','files'])assert.ok(summary.includes(`/work/projects/launch#project-${subject}-title`));
});
