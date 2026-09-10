import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { contentCalendar } from '@/lib/bloomops/content-calendar.mjs';
import { contentMonth } from '@/lib/bloomops/content-calendar-values.mjs';
import { contentOptions } from '@/lib/bloomops/content.mjs';
import ContentCalendar from '@/components/bloomops/ContentCalendar';
import { Button,Notice,PageHeader } from '@/components/bloomops/Primitives';
export const dynamic='force-dynamic';
export const metadata={title:'Content calendar'};
export default async function CalendarPage({searchParams}) {
  const {access,actor}=await requireShell('internal'),query=await searchParams||{};
  const allowed=['month','clientId','platform','stage','page'],month=contentMonth(query.month);
  if(!month||Object.keys(query).some(k=>!allowed.includes(k)||typeof query[k]!=='string'))return <><PageHeader title="Content calendar" /><Notice tone="error">Choose a valid month and available filters.</Notice><Button href="/social/calendar">Reset calendar</Button></>;
  const {month:ignored,...filters}=query,result=await contentCalendar(access.db,actor,{...filters,start:month.start,end:month.end});
  if(!result.ok)return <><PageHeader title="Content calendar" /><Notice tone="error">Choose a valid month and available filters.</Notice><Button href="/social/calendar">Reset calendar</Button></>;
  const options=await contentOptions(access.db,actor);
  return <ContentCalendar result={result} month={month} query={query} options={options} />;
}
