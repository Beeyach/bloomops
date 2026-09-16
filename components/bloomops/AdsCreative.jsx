import { Button, EmptyState, Facts, Field, Notice, PageHeader, Section, Status } from './Primitives';
import { Icon } from './Icons';
import ContentPipeline from './ContentPipeline';
import ContentPlatforms from './ContentPlatforms';
import { CONTENT_STAGE_LABELS, CONTENT_TYPE_LABELS, CONTENT_VISIBILITY_LABELS } from '@/lib/bloomops/content-values.mjs';
import { ADS_STAGES } from '@/lib/bloomops/content-pipeline-values.mjs';
const base='/ads/creative';
export function AdsNavigation({creative=false}) {
  return <nav className="bo-view-nav" aria-label="Ads views"><Button href="/ads" aria-current={!creative?'page':undefined}>Campaign work</Button><Button href={base} aria-current={creative?'page':undefined}>Creative</Button></nav>;
}
function Context({item}) {
  return <dl className="bo-ads-context">{[['Project',item.projectName],['Client',item.clientName],['Service',item.serviceName]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}
function CreativeType({item}) {
  const icon=['reel','video','story'].includes(item.type)?'video':['static_post','carousel'].includes(item.type)?'image':item.type==='email'?'mail':'pages';
  return <span className="bo-creative-type"><Icon name={icon} size={16} />{CONTENT_TYPE_LABELS[item.type]}</span>;
}
function CreativeState({item}) {
  return <div className="bo-creative-badges"><Status label={CONTENT_STAGE_LABELS[item.stage]} tone={item.stage==='revision_requested'?'warning':'info'} /><Status label={CONTENT_VISIBILITY_LABELS[item.visibility]} tone={item.visibility==='restricted'?'warning':'neutral'} /></div>;
}
export function AdsCreativeList({result,facets}) {
  const query=result.filters,href=page=>`${base}?${new URLSearchParams({...query,page:String(page)})}`;
  const filters=[['projectId','Project'],['clientId','Client'],['serviceEngagementId','Service'],['ownerMembershipId','Owner'],['platform','Platform'],['stage','Stage'],['type','Content type']];
  return <><PageHeader title="Ads creative" subtitle="Copy, working assets and internal review for your campaign projects." actions={<Button href={`${base}/new`} variant="primary">Create creative</Button>} /><AdsNavigation creative />
    <form action={base} className="bo-content-filters" aria-label="Filter Ads creative">{filters.map(([key,label])=>{
      const items=key==='type'?Object.entries(CONTENT_TYPE_LABELS).map(([id,name])=>({id,name})):key==='stage'?ADS_STAGES.map(id=>({id,name:CONTENT_STAGE_LABELS[id]})):facets[key].items;
      return <Field key={key} id={`creative-filter-${key}`} label={label}><select id={`creative-filter-${key}`} name={key} className="bo-control" defaultValue={query[key] || ''}><option value="">All</option>{query[key]&&!items.some(i=>i.id===query[key])&&<option value={query[key]}>Selected filter</option>}{items.map(item=><option key={item.id} value={item.id}>{item.name || 'Previous owner'}</option>)}</select></Field>;
    })}<Button type="submit">Apply filters</Button><Button href={base} variant="ghost">Clear filters</Button></form>
    {Object.values(facets).some(f=>f.hasMore)&&<Notice>Showing the first 200 available choices per filter. All accessible creative remains available through the list pages.</Notice>}
    {!result.items.length?<EmptyState title="No creative in this view"><p>{Object.entries(query).some(([k,v])=>k!=='page'&&v)?'Clear the filters to see other creative.':'Create the first idea for an Ads Project.'}</p></EmptyState>:<ul className="bo-rows" aria-label="Ads creative">{result.items.map(item=><li key={item.id} className="bo-creative-row">
      <div className="bo-row-text"><a className="bo-link bo-project-name" href={`${base}/${item.id}`}>{item.title}</a><Context item={item} /></div>
      <CreativeState item={item} /><div className="bo-creative-meta"><CreativeType item={item} /><span>Owner: {item.ownerName || 'Nobody yet'}</span>{item.targetPublishDate&&<span>Target: {item.targetPublishDate}</span>}</div>
      {!!item.platforms?.length&&<ul className="bo-creative-platforms" aria-label="Platforms">{item.platforms.map(p=><li key={p.key}>{p.key==='instagram'&&<Icon name="instagram" size={16} />}{p.label}</li>)}</ul>}
    </li>)}</ul>}
    {(result.page > 1 || result.hasMore) && <nav className="bo-content-pagination" aria-label="Creative pages">{result.page>1&&<Button href={href(result.page-1)}>Previous page</Button>}<p className="bo-small">Page {result.page}</p>{result.hasMore&&result.page<10000&&<Button href={href(result.page+1)}>Next page</Button>}</nav>}
  </>;
}
export function AdsCreativeDetail({item}) {
  return <div className="bo-creative-detail"><Button href={base} variant="ghost">Back to creative</Button><PageHeader title={item.title} actions={item.editable&&<Button href={`${base}/${item.id}/edit`}>Edit details</Button>} /><Context item={item} /><CreativeState item={item} />
    <Facts items={[["Type",<CreativeType key="type" item={item} />],["Owner",item.ownerName || 'Nobody yet'],["Pillar",item.pillar || 'Not set'],["Target publish date",item.targetPublishDate || 'Not set']]} />
    {item.editable?<><ContentPipeline item={item} base={base} /><ContentPlatforms item={item} base={base} /></>:<Notice>This creative is unavailable for editing. Contact your workspace administrator.</Notice>}
    {[['hook','Hook'],['script','Script'],['caption','Caption'],['cta','Call to action']].filter(([key])=>item[key]).map(([key,label])=><Section key={key} id={`creative-${key}`} title={label}><p className="bo-content-copy">{item[key]}</p></Section>)}
  </div>;
}
