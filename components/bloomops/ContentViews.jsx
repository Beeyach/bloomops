import ContentPlatforms from './ContentPlatforms';
import ContentPipeline from './ContentPipeline';
import { Button, EmptyState, Facts, Field, Notice, PageHeader, Section, Status } from './Primitives';
import { CONTENT_STAGE_LABELS, CONTENT_TYPE_LABELS, CONTENT_VISIBILITY_LABELS } from '@/lib/bloomops/content-values.mjs';
export function ContentList({ result, query = {}, options }) {
  const pageHref = page => `/social?${new URLSearchParams({ ...query, page: String(page) })}`;
  const choices = (key, label) => [...new Map([...options.parents, ...result.items].filter(p => p[key]).map(p => [p[key], p[label] || 'Current selection'])).entries()];
  return <>
    <PageHeader title="Social" subtitle="Ideas and editorial details for your clients." actions={<Button href="/social/new" variant="primary">Create Content</Button>} />
    <nav className="bo-form-actions" aria-label="Social views"><Button href="/social" aria-current="page">Content list</Button><Button href="/social/calendar">Calendar</Button></nav>
    <form className="bo-content-filters" action="/social" aria-label="Filter Content">
      {[['clientId', 'Client', choices('clientId', 'clientName')], ['serviceEngagementId', 'Social service', choices('serviceEngagementId', 'serviceName')], ['stage', 'Stage', Object.entries(CONTENT_STAGE_LABELS)], ['type', 'Content type', Object.entries(CONTENT_TYPE_LABELS)], ['ownerMembershipId', 'Owner', [...new Map([...options.members.map(m => [m.membershipId, m.name]), ...result.items.filter(i => i.ownerMembershipId).map(i => [i.ownerMembershipId, i.ownerName])])]]].map(([key, label, rows]) => <Field key={key} id={`filter-${key}`} label={label}><select id={`filter-${key}`} name={key} className="bo-control" defaultValue={query[key] || ''}><option value="">All</option>{query[key] && !rows.some(([id]) => id === query[key]) && <option value={query[key]}>Selected filter</option>}{rows.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></Field>)}
      <Field id="filter-platform" label="Platform"><input id="filter-platform" name="platform" className="bo-control" maxLength={120} defaultValue={query.platform || ''} /></Field>
      <Button type="submit">Apply filters</Button><Button href="/social" variant="ghost">Clear filters</Button>
    </form>
    {(options.parentsOverflow || options.membersOverflow) && <Notice>Filter choices show the first available Clients, services and owners. All accessible Content remains available through the pages below.</Notice>}
    {!result.items.length ? <EmptyState title="No Content here yet"><p>{Object.values(query).some(Boolean) ? 'Try clearing the filters or returning to the first page.' : 'Create an idea for a Client or a purchased Social service.'}</p></EmptyState> : <ul className="bo-content-list" aria-label="Content items">{result.items.map(item => <li key={item.id}>
      <div><a className="bo-content-title" href={`/social/${item.id}`}>{item.title}</a><p className="bo-small">{item.clientName} · {item.serviceName || 'Client-level Content'}{item.packageName ? ` · ${item.packageName}` : ''}</p></div>
      <div className="bo-content-summary"><span>{CONTENT_TYPE_LABELS[item.type]}</span><span>{item.platforms?.map(p=>p.label).join(' · ') || 'No platforms set'}</span><Status label={CONTENT_STAGE_LABELS[item.stage]} /><span>{item.ownerName || 'No owner'}</span><span>{item.targetPublishDate ? `Target ${item.targetPublishDate}` : 'No target date'}</span><span>{CONTENT_VISIBILITY_LABELS[item.visibility]}</span></div>
    </li>)}</ul>}
    <nav className="bo-content-pagination" aria-label="Content pages">{result.page > 1 && <Button href={pageHref(result.page - 1)}>Previous page</Button>}<p className="bo-small">Page {result.page}{result.hasMore ? ' · More Content is available.' : ''}</p>{result.hasMore && <Button href={pageHref(result.page + 1)}>Next page</Button>}</nav>
  </>;
}
export function ContentDetail({ item }) {
  return <div className="bo-content-detail">
    <Button href="/social" variant="ghost" size="sm">Back to Social</Button>
    <PageHeader title={item.title} subtitle={`${item.clientName} · ${item.serviceName || 'Client-level Content'}${item.packageName ? ` · ${item.packageName}` : ''}`} actions={<Button href={`/social/${item.id}/edit`}>Edit details</Button>} />
    <Facts items={[
      ['Type', CONTENT_TYPE_LABELS[item.type]], ['Stage', <Status key="stage" label={CONTENT_STAGE_LABELS[item.stage]} />], ['Pillar', item.pillar || 'Not set'], ['Owner', item.ownerName || 'Nobody yet'], ['Target publish date', item.targetPublishDate || 'Not set'], ['Visibility', CONTENT_VISIBILITY_LABELS[item.visibility]],
      ['Recording required', item.recordingRequired ? 'Yes' : 'No'], ['Internal review required', item.internalReviewRequired ? 'Yes' : 'No'], ['Client approval required', item.clientApprovalRequired ? 'Yes' : 'No'],
    ]} />
    <ContentPipeline item={item} />
    <ContentPlatforms item={item} />
    {item.visibility === 'client' && <p className="bo-hint">Client eligible. Only a recording request is shared while recording is required and this item is Waiting for Recording. Editorial details and internal context stay private.</p>}
    {[['hook', 'Hook'], ['script', 'Script'], ['caption', 'Caption'], ['cta', 'Call to action']].map(([key, label]) => <Section key={key} id={`content-${key}`} title={label}><p className="bo-content-copy">{item[key] || 'Not written yet.'}</p></Section>)}
  </div>;
}
