import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { schema } from './db.mjs';
import { evaluate } from './authorization.mjs';
import { validateDate } from './clients.mjs';
import { contentReadCondition } from './content-access.mjs';
import { contentPlatformSelection, contentPlatformCondition } from './content-platform-read.mjs';
import { contentFilters } from './content.mjs';
import { CONTENT_QUERY_FIELDS, CONTENT_PAGE_SIZE } from './content-values.mjs';
import { CONTENT_CALENDAR_MAX_DAYS } from './content-calendar-values.mjs';
export const CONTENT_CALENDAR_QUERY_FIELDS=[...CONTENT_QUERY_FIELDS,'start','end'];
export function contentCalendarFilters(query) {
  const invalid=()=>({ok:false,reason:'invalid',errors:{form:'Choose real start and end dates, at most 42 days apart inclusively, and available Content filters.'}});
  if(!query||typeof query!=='object'||Array.isArray(query)||Object.keys(query).some(k=>!CONTENT_CALENDAR_QUERY_FIELDS.includes(k)))return invalid();
  const {start,end,...rest}=query;
  for(const date of [start,end])if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!validateDate(date,'calendar date').ok)return invalid();
  const days=(Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000+1;
  if(days<1||days>CONTENT_CALENDAR_MAX_DAYS)return invalid();
  const parsed=contentFilters(rest);return parsed.ok?{ok:true,filters:{...parsed.filters,start,end}}:parsed;
}
export async function contentCalendar(db,actor,query) {
  if(!evaluate(actor,{action:'content.calendar'}).allowed)return {ok:false,reason:'forbidden'};
  const parsed=contentCalendarFilters(query);if(!parsed.ok)return parsed;
  const f=parsed.filters,c=schema.contentItems,cl=schema.clients,where=[contentReadCondition(actor),gte(c.targetPublishDate,f.start),lte(c.targetPublishDate,f.end)];
  for(const k of CONTENT_QUERY_FIELDS.filter(k=>!['page','platform'].includes(k)))if(f[k])where.push(eq(c[k],f[k]));
  if(f.platform)where.push(contentPlatformCondition(f.platform));
  const rows=await db.select({id:c.id,title:c.title,type:c.type,clientId:c.clientId,clientName:cl.name,serviceEngagementId:c.serviceEngagementId,stage:c.stage,targetPublishDate:c.targetPublishDate,publishedAt:c.publishedAt,platforms:contentPlatformSelection()}).from(c)
    .innerJoin(cl,and(eq(cl.workspaceId,c.workspaceId),eq(cl.id,c.clientId))).where(and(...where)).orderBy(asc(c.targetPublishDate),asc(c.id)).limit(CONTENT_PAGE_SIZE+1).offset((f.page-1)*CONTENT_PAGE_SIZE);
  return {ok:true,items:rows.slice(0,CONTENT_PAGE_SIZE),hasMore:rows.length>CONTENT_PAGE_SIZE,page:f.page,start:f.start,end:f.end};
}
