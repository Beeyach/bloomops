import { Button, EmptyState, Facts, PageHeader, Section, Status } from './Primitives';
import { FileList } from './Files';
import { CONTENT_TYPE_LABELS } from '@/lib/bloomops/content-values.mjs';
import { PORTAL_CONTENT_VIEWS } from '@/lib/bloomops/portal-content-values.mjs';
import { formatDate } from '@/lib/bloomops/format.mjs';

function RequiredActions({ item }) {
  return <div className="bo-portal-content-actions">
    {item.recordingNeeded && <Button href={`/portal/recordings/${item.id}`}>Recording needed</Button>}
    {item.approvalRoundId && <Button href={`/portal/approvals/${item.approvalRoundId}`}>Approval needed</Button>}
  </div>;
}
const status = item => <Status label={item.statusLabel} tone={item.statusLabel === 'Published' ? 'success' : 'neutral'} />;
const pageHref = (view, page) => `/portal/content?view=${view}&page=${page}`;
const empty = {
  current: ['No Content in progress', 'Shared work will appear here when it is ready to follow.'],
  action: ['You’re all set for now', 'There are no recordings or approvals waiting for you.'],
  published: ['No recent publications', 'Content marked as published in the past 30 days will appear here.'],
};

export function PortalContentList({ result }) {
  const { items, view, page, hasMore } = result;
  return <>
    <PageHeader title="Your content" subtitle="Follow what’s taking shape, what’s coming next, and anything that needs you." />
    <nav className="bo-portal-content-views" aria-label="Content views">{Object.entries(PORTAL_CONTENT_VIEWS).map(([key, label]) =>
      <a key={key} href={pageHref(key, 1)} aria-current={view === key ? 'page' : undefined}>{label}</a>)}</nav>
    {view === 'published' && <p className="bo-small">Marked as published in the past 30 days.</p>}
    {items.length ? <ul className="bo-portal-content-list" aria-label={PORTAL_CONTENT_VIEWS[view]}>{items.map(item => <li key={item.id}>
      <div className="bo-portal-content-heading"><h2 className="bo-h2"><a className="bo-content-title" href={`/portal/content/${item.id}`}>{item.title}</a></h2>{status(item)}</div>
      <p className="bo-small">{item.clientName} · {CONTENT_TYPE_LABELS[item.type]}</p>
      <p className="bo-body">{item.publishedAt ? `Published ${formatDate(item.publishedAt)}` : item.targetPublishDate ? `Planned for ${formatDate(item.targetPublishDate)}` : 'Date to be confirmed'}</p>
      {item.platforms.length > 0 && <p className="bo-small">{item.platforms.join(' · ')}</p>}
      <RequiredActions item={item} />
      {item.hasFiles && <a className="bo-portal-content-files-link" href={`/portal/content/${item.id}#content-files-title`}>View files</a>}
    </li>)}</ul> : <EmptyState title={page > 1 ? 'No Content on this page' : empty[view][0]}><p>{page > 1 ? 'Return to the first page to see current shared work.' : empty[view][1]}</p></EmptyState>}
    {(page > 1 || hasMore) && <nav className="bo-portal-content-actions" aria-label="Content pages">
      {page > 1 && <Button href={pageHref(view, 1)}>First page</Button>}
      {page > 1 && <Button href={pageHref(view, page - 1)}>Previous page</Button>}
      {hasMore && <Button href={pageHref(view, page + 1)}>Next page</Button>}
    </nav>}
  </>;
}

export function PortalContentDetail({ item }) {
  return <>
    <Button href="/portal/content" variant="ghost">Back to content</Button>
    <PageHeader title={item.title} subtitle={`${item.clientName} · ${CONTENT_TYPE_LABELS[item.type]}`} />
    <Facts items={[
      ['Status', status(item)],
      ['Planned publish date', item.targetPublishDate ? formatDate(item.targetPublishDate) : 'To be confirmed'],
      ['Platforms', item.platforms.length ? item.platforms.join(' · ') : 'To be confirmed'],
      ...(item.publishedAt ? [['Published', formatDate(item.publishedAt)]] : []),
    ]} />
    <Section id="content-next" title="From you">
      {item.recordingNeeded || item.approvalRoundId ? <RequiredActions item={item} /> : <p className="bo-body">Nothing is needed from you right now.</p>}
    </Section>
    <Section id="content-files" title="Files"><FileList items={item.files.items} portal content /></Section>
  </>;
}
