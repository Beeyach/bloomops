// Interaction checks over real notifications created by the discussion writer.
import assert from 'node:assert/strict';
export async function checkNotificationBell({page,ctx,base,inbox,command,check,out}){
 await page.goto(base+'/work',{waitUntil:'networkidle'});
 const bell=page.getByRole('button',{name:/^Notifications/}),panel=page.getByRole('dialog',{name:'Recent notifications',exact:true});
 const before=await inbox(ctx),item=before.items[0];assert.ok(item);
 await bell.focus();await page.keyboard.press('Enter');await panel.getByRole('button',{name:new RegExp(item.title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))}).waitFor();
 check('bell opens without route navigation',new URL(page.url()).pathname==='/work');
 check('opening bell preserves unread state',(await inbox(ctx)).unread===before.unread);
 check('bell exposes bounded real deliveries and full inbox',await panel.locator('li').count()<=6&&await panel.getByRole('link',{name:'View all notifications',exact:true}).getAttribute('href')==='/notifications');
 await page.screenshot({path:out+'/bell-1440.png',fullPage:true});await page.keyboard.press('Escape');check('Escape dismisses and returns bell focus',await bell.evaluate(e=>e===document.activeElement)&&!await panel.isVisible());
 await bell.click();await panel.getByText(item.title,{exact:true}).waitFor();await page.getByRole('heading',{name:'Work',exact:true}).click();check('outside pointer dismisses desktop panel',!await panel.isVisible());
 await page.route('**/api/bloomops/notifications',route=>route.request().method()==='GET'?route.fulfill({status:503,contentType:'application/json',body:'{}'}):route.continue(),{times:1});await bell.click();await panel.getByRole('alert').waitFor();await panel.getByRole('button',{name:'Try again',exact:true}).click();await panel.getByText(item.title,{exact:true}).waitFor();check('bell recovers from a failed read without losing destination',true);
 await page.keyboard.press('Escape');await page.setViewportSize({width:390,height:844});await bell.click();await panel.getByText(item.title,{exact:true}).waitFor();
 check('mobile panel is a real modal dialog',await panel.evaluate(e=>e.matches(':modal')));check('mobile panel fits viewport',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await panel.getByRole('link',{name:'View all notifications',exact:true}).focus();await page.keyboard.press('Tab');check('mobile keyboard focus stays inside dialog',await panel.evaluate(e=>e.contains(document.activeElement)));await page.screenshot({path:out+'/bell-390.png',fullPage:true});
 await page.keyboard.press('Escape');await page.setViewportSize({width:1440,height:1000});
 let releaseOpen,openArrived;const openGate=new Promise(r=>releaseOpen=r),openRequested=new Promise(r=>openArrived=r);
 await page.route('**/api/bloomops/notifications',async route=>{if(route.request().method()!=='POST')return route.continue();const response=await route.fetch();openArrived();await openGate;await route.fulfill({response});});
 await bell.click();await panel.getByText(item.title,{exact:true}).click();await openRequested;await page.keyboard.press('Escape');releaseOpen();await page.waitForLoadState('networkidle');
 check('dismissing a pending open does not navigate on its obsolete response',new URL(page.url()).pathname==='/work'&&!await panel.isVisible());await page.unroute('**/api/bloomops/notifications');await command(ctx,{action:'read',id:item.id,read:false});
 await bell.click();await panel.getByText(item.title,{exact:true}).click();await page.waitForURL(u=>u.pathname.startsWith('/discussions/'));check('bell item uses authorized open and marks only that item read',(await inbox(ctx)).items.find(n=>n.id===item.id).readAt!==null);
 await command(ctx,{action:'read',id:item.id,read:false});
 await page.goto(base+'/work',{waitUntil:'networkidle'});
 let release,arrived;const gate=new Promise(r=>release=r),requested=new Promise(r=>arrived=r);
 await page.route('**/api/bloomops/notifications',async route=>{if(route.request().method()!=='GET')return route.continue();const response=await route.fetch();arrived();await gate;await route.fulfill({response}).catch(()=>{});},{times:1});
 await bell.click();await requested;await page.evaluate(()=>window.dispatchEvent(new Event('bloomsi:draft-context')));await panel.getByRole('alert').waitFor();release();await page.waitForLoadState('networkidle');check('scope invalidation rejects a delayed delivery response',await panel.locator('li').count()===0);await page.unroute('**/api/bloomops/notifications');await page.reload({waitUntil:'networkidle'});
}
