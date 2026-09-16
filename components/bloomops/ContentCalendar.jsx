import { Button,EmptyState,Field,PageHeader,Status } from './Primitives';
import { CONTENT_STAGE_LABELS,CONTENT_TYPE_LABELS } from '@/lib/bloomops/content-values.mjs';
import { contentDateLabel } from '@/lib/bloomops/content-calendar-values.mjs';
export default function ContentCalendar({result,month,query={},options}) {
  const href=changes=>`/social/calendar?${new URLSearchParams({...query,month:month.month,...changes})}`;
  const clients=[...new Map([...options.parents,...result.items].map(p=>[p.clientId,p.clientName])).entries()];
  const dates=[...new Set(result.items.map(i=>i.targetPublishDate))];
  return <>
    <PageHeader title="Content calendar" subtitle="A month of planned publication, grouped by date." actions={<Button href="/social/new" variant="primary">Create Content</Button>} />
    <nav className="bo-form-actions" aria-label="Social views"><Button href="/social">Content list</Button><Button href="/social/calendar" aria-current="page">Calendar</Button></nav>
    <form action="/social/calendar" className="bo-content-filters" aria-label="Filter calendar">
      <Field id="calendar-month" label="Month"><input id="calendar-month" name="month" type="month" min="0100-01" max="9999-12" className="bo-control" defaultValue={month.month} required /></Field>
      <Field id="calendar-client" label="Client"><select id="calendar-client" name="clientId" className="bo-control" defaultValue={query.clientId||''}><option value="">All</option>{query.clientId&&!clients.some(([id])=>id===query.clientId)&&<option value={query.clientId}>Selected Client</option>}{clients.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></Field>
      <Field id="calendar-platform" label="Platform"><input id="calendar-platform" name="platform" className="bo-control" maxLength={120} defaultValue={query.platform||''} /></Field>
      <Field id="calendar-stage" label="Stage"><select id="calendar-stage" name="stage" className="bo-control" defaultValue={query.stage||''}><option value="">All</option>{Object.entries(CONTENT_STAGE_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></Field>
      <Button type="submit">Apply filters</Button><Button href="/social/calendar" variant="ghost">Clear filters</Button>
    </form>
    <nav className="bo-content-pagination" aria-label="Calendar months">{month.previous&&<Button href={href({month:month.previous,page:'1'})}>Previous month</Button>}<p>{month.month}</p>{month.next&&<Button href={href({month:month.next,page:'1'})}>Next month</Button>}</nav>
    <p className="bo-hint">Dates are the target publish dates entered on Content. Items without a target date remain in the Content list. Edit dates through Content details.</p>
    {options.parentsOverflow&&<p className="bo-hint">The first available Client choices are shown. All accessible dated Content remains available in the calendar pages.</p>}
    {!result.items.length?<EmptyState title="Nothing planned in this range"><p>Choose another month, clear filters, or add a target publish date to Content.</p></EmptyState>:<div className="bo-content-calendar">{dates.map(date=><section key={date} aria-labelledby={`calendar-${date}`}>
      <h2 id={`calendar-${date}`} className="bo-h2"><time dateTime={date}>{contentDateLabel(date)}</time></h2>
      <ul className="bo-content-list" aria-label={`Content for ${date}`}>{result.items.filter(i=>i.targetPublishDate===date).map(item=><li key={item.id}>
        <div><a className="bo-content-title" href={`/social/${item.id}`}>{item.title}</a><p className="bo-small bo-record-subtitle"><span>{item.clientName}</span><span>{CONTENT_TYPE_LABELS[item.type]}</span></p></div>
        <div className="bo-content-summary"><Status label={CONTENT_STAGE_LABELS[item.stage]} /><span>{item.platforms.length?item.platforms.map(p=><span key={p.label}>{p.label}</span>):'No platforms set'}</span>{item.stage==='published'&&item.publishedAt&&<span>Published <time dateTime={item.publishedAt}>{item.publishedAt.replace('T',' ').replace('Z',' UTC')}</time></span>}</div>
      </li>)}</ul>
    </section>)}</div>}
    <nav className="bo-content-pagination" aria-label="Calendar pages">{result.page>1&&<Button href={href({page:String(result.page-1)})}>Previous page</Button>}<p className="bo-small">Page {result.page}{result.hasMore&&<span className="bo-pagination-note">More dated Content is available.</span>}</p>{result.hasMore&&<Button href={href({page:String(result.page+1)})}>Next page</Button>}</nav>
  </>;
}
