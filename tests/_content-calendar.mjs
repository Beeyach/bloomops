import { setup as content } from './_content.mjs';
import { all } from './_bloomops-db.mjs';
import { setContentPlatforms } from '../lib/bloomops/content-platforms.mjs';
import { contentCalendar } from '../lib/bloomops/content-calendar.mjs';
export async function setup(options={}) {
 const t=await content(options);
 t.snapshot=()=>['content_items','content_platforms','activity_events'].map(table=>all(t.raw,`SELECT * FROM ${table} ORDER BY rowid`));
 t.platforms=(id,platforms,extra={})=>setContentPlatforms(t.db,{actor:t.owner,contentId:id,input:{platforms,expectedRevision:1},...extra});
 t.calendar=(actor=t.owner,query={})=>contentCalendar(t.db,actor,{start:'2026-09-01',end:'2026-09-30',...query});
 return t;
}
