// Deterministic request ordering in the actual built inbox. No application hooks.
import assert from 'node:assert/strict';

export async function notificationPreferencesRegression({page,base,check,selectWorkspace,selectUser}) {
 const settingsUrl=base+'/api/bloomops/notifications?settings=true';
 const listResponse=r=>new URL(r.url()).pathname==='/api/bloomops/notifications'&&new URL(r.url()).searchParams.has('category');
 const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const open=()=>page.getByRole('button',{name:'Preferences',exact:true});
 const mentions=()=>page.getByRole('checkbox',{name:'Mentions',exact:true});
 async function hold(){
  let captured,release,finished;
  const pending=new Promise(r=>{captured=r;}),gate=new Promise(r=>{release=r;}),done=new Promise(r=>{finished=r;});
  const handler=async route=>{const response=await route.fetch();captured();await gate;try{await route.fulfill({response});}finally{finished();}};
  await page.route(settingsUrl,handler,{times:1});
  return {pending,release:async()=>{release();await done;await page.unroute(settingsUrl,handler);await settle();}};
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
 check('obsolete response cannot clear newer loading state',await page.getByText('Loading preferences…',{exact:true}).count()===1&&await mentions().count()===0);
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
 const schedule=window.setInterval.bind(window),cancel=window.clearInterval.bind(window);window.__n2eIntervals=new Map();
 window.setInterval=(fn,ms,...args)=>{const id=schedule(fn,ms,...args);if(ms===30000)window.__n2eIntervals.set(id,()=>fn(...args));return id;};
 window.clearInterval=id=>{window.__n2eIntervals.delete(id);cancel(id);};
}
