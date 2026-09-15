// Deterministic request ordering in the actual built inbox. No application hooks.
import assert from 'node:assert/strict';

export async function notificationPreferencesRegression({page,base,check,selectWorkspace,selectUser}) {
 const settingsUrl=base+'/api/bloomops/notifications?settings=true';
 const listResponse=r=>new URL(r.url()).pathname==='/api/bloomops/notifications'&&new URL(r.url()).searchParams.has('category');
 const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const open=()=>page.getByRole('button',{name:'Preferences',exact:true});
 const mentions=()=>page.getByRole('checkbox',{name:'Mentions',exact:true});
 async function hold(){
  const id=await page.evaluate(()=>window.__n2eHoldSettings());
  return {
   pending:page.waitForFunction(id=>window.__n2eSettingsRequests.get(id).received,id),
   release:async()=>{await page.evaluate(id=>window.__n2eSettingsRequests.get(id).release(),id);await page.waitForFunction(id=>window.__n2eSettingsRequests.get(id).finished,id);await settle();}
  };
 }

 for(const event of ['focus','pageshow','interval']){
  await page.goto(base+'/notifications',{waitUntil:'networkidle'});
  const held=await hold();await open().click();await held.pending;
  check(`${event}: preferences request pending`,await mentions().count()===0);
  const refreshed=page.waitForResponse(listResponse);
  await page.evaluate(event=>{if(event==='interval'){if(!window.__n2eIntervals?.size)throw Error('Inbox interval not registered');for(const tick of window.__n2eIntervals.values())tick();}else window.dispatchEvent(new Event(event));},event);
  await (await refreshed).finished();await settle();check(`${event}: inbox completed before preferences released`,await mentions().count()===0);
  await held.release();await mentions().waitFor({state:'visible',timeout:5000});
  check(`${event}: preferences loading ends`,!await page.getByText('Loading preferences…',{exact:true}).count());
  const before=await mentions().isChecked();await mentions().click();await page.getByText('Preference saved.',{exact:true}).waitFor();
  check(`${event}: setting saves`,await mentions().isChecked()!==before);
  // Restore the synthetic preference through the UI for the existing suite.
  await mentions().click();await page.waitForFunction(expected=>{const input=[...document.querySelectorAll('input[type=checkbox]')].find(e=>e.closest('label')?.textContent.includes('Mentions'));return input?.checked===expected&&!input.disabled;},before);
 }
 // Settings errors survive an unrelated successful list refresh.
 await page.goto(base+'/notifications',{waitUntil:'networkidle'});
 await page.route(settingsUrl,route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic preferences failure'})}),{times:1});
 await open().click();await page.getByRole('alert').filter({hasText:'Synthetic preferences failure'}).waitFor();
 const listDone=page.waitForResponse(listResponse);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await(await listDone).finished();await settle();
 check('inbox refresh does not erase preferences error',await page.getByRole('alert').filter({hasText:'Synthetic preferences failure'}).count()===1);
 await open().click();await open().click();await mentions().waitFor();check('preferences retry recovers independently',await mentions().isEnabled());
 // Panel dismissal invalidates a late settings response without blocking reopen.
 await page.goto(base+'/notifications',{waitUntil:'networkidle'});const dismissed=await hold();await open().click();await dismissed.pending;await open().click();
 check('dismissed preferences stay closed',await page.getByRole('region',{name:'Notification preferences'}).count()===0);
 const newer=await hold();await open().click();await newer.pending;await dismissed.release();
 const loading=await page.getByText('Loading preferences…',{exact:true}).count(),controls=await mentions().count();
 assert.equal(controls,0,'obsolete response must not populate new request');assert.equal(loading,1,'new request must retain loading state');check('obsolete response cannot clear newer loading state',true);
 await newer.release();await mentions().waitFor();check('preferences reopen after dismissed request',await mentions().isEnabled());
 // A real selected-workspace change while an old response is held. The refresh
 // observes the new server scope before the old response is released.
 await page.goto(base+'/notifications',{waitUntil:'networkidle'});const old=await hold();await open().click();await old.pending;
 await selectWorkspace('b');const refreshed=page.waitForResponse(listResponse);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await(await refreshed).finished();
 await page.getByText('Your account or workspace changed. Reload this page.',{exact:true}).waitFor();await old.release();
 check('old workspace response cannot repopulate preferences',await mentions().count()===0);
 await page.reload({waitUntil:'networkidle'});await open().click();await mentions().waitFor();
 const settings=await(await page.request.get(settingsUrl)).json();assert.equal(settings.scope.workspaceId,'b');
 check('new workspace preferences remain usable',await mentions().isEnabled());
 await selectWorkspace('a');await page.goto(base+'/notifications',{waitUntil:'networkidle'});
 const oldUser=await hold();await open().click();await oldUser.pending;await selectUser('owner');
 const userRefresh=page.waitForResponse(listResponse);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await(await userRefresh).finished();
 await page.getByText('Your account or workspace changed. Reload this page.',{exact:true}).waitFor();await oldUser.release();
 check('old user response cannot repopulate preferences',await mentions().count()===0);
 await page.reload({waitUntil:'networkidle'});await open().click();await mentions().waitFor();
 const userSettings=await(await page.request.get(settingsUrl)).json();assert.equal(userSettings.scope.userId,'ellen');check('new user preferences remain usable',await mentions().isEnabled());
 await selectUser('ary');await page.goto(base+'/notifications',{waitUntil:'networkidle'});
}

export function captureNotificationIntervals(){
 // Hold each fetch promise separately after its real server response arrives.
 // Concurrent same-URL Chromium requests can share a routed network response;
 // separate gates keep release ordering deterministic even in that case.
 const request=window.fetch.bind(window);let serial=0;window.__n2eSettingsRequests=new Map();
 window.__n2eHoldSettings=()=>{const id=++serial;let release;const gate=new Promise(resolve=>{release=resolve;});window.__n2eSettingsRequests.set(id,{gate,release,claimed:false,received:false,finished:false});return id;};
 window.fetch=async(input,options)=>{
  const url=new URL(typeof input==='string'?input:input.url,location.href);
  const held=url.pathname==='/api/bloomops/notifications'&&url.search==='?settings=true'?[...window.__n2eSettingsRequests.values()].find(entry=>!entry.claimed):null;
  if(held)held.claimed=true;const response=await request(input,options);
  if(held){held.received=true;await held.gate;held.finished=true;}return response;
 };

 const schedule=window.setInterval.bind(window),cancel=window.clearInterval.bind(window);window.__n2eIntervals=new Map();
 window.setInterval=(fn,ms,...args)=>{const id=schedule(fn,ms,...args);if(ms===30000)window.__n2eIntervals.set(id,()=>fn(...args));return id;};
 window.clearInterval=id=>{window.__n2eIntervals.delete(id);cancel(id);};
}
