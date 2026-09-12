import { notFound } from 'next/navigation';
import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { adsCreativeOptions } from '@/lib/bloomops/ads-creative.mjs';
import ContentForm from '@/components/bloomops/ContentForm';
import { Button, EmptyState, Field, Notice, PageHeader } from '@/components/bloomops/Primitives';
export const dynamic='force-dynamic';
export const metadata={title:'Create Ads creative'};
export default async function NewCreativePage({searchParams}) {
  const {access,actor}=await requireShell('internal'),query=await searchParams || {};
  if(Object.keys(query).some(k=>!['q','projectId'].includes(k)))notFound();
  const options=await adsCreativeOptions(access.db,actor,query);if(!options)notFound();
  return <><Button href="/ads/creative" variant="ghost">Back to creative</Button><PageHeader title="Create creative" subtitle="Choose its campaign Project, then shape the idea." />
    <form action="/ads/creative/new" className="bo-content-parent-search"><Field id="creative-parent-search" label="Find a Project, Client or service"><input id="creative-parent-search" name="q" className="bo-control" type="search" maxLength={120} defaultValue={query.q || ''} /></Field><Button type="submit">Find Projects</Button></form>
    {options.parentsOverflow&&<Notice>Showing the first 200 Projects. Narrow your search to find another Project.</Notice>}
    {options.parents.length?<ContentForm area="ads" options={options} />:<EmptyState title="No available Ads Project"><p>{query.q?'Try another Project, Client or service name.':'Creative needs an Ads Project you can access. Ask your project manager to set up the campaign work or its assignment.'}</p></EmptyState>}
  </>;
}
