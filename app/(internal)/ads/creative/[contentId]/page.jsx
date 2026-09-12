import { notFound } from 'next/navigation';
import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { getAdsContent, adsCreativeHistory } from '@/lib/bloomops/ads-creative.mjs';
import { listContentFiles, canRestrictContentFiles } from '@/lib/bloomops/content-files.mjs';
import { AdsCreativeDetail } from '@/components/bloomops/AdsCreative';
import FileControls from '@/components/bloomops/FileControls';
import { Section } from '@/components/bloomops/Primitives';
import { ActivityRow } from '@/components/bloomops/Clients';
import { describeEvent } from '@/lib/bloomops/client-activity.mjs';
export const dynamic='force-dynamic';
export const metadata={title:'Ads creative'};
export default async function CreativeDetailPage({params,searchParams}) {
  const {access,actor}=await requireShell('internal');if(Object.keys(await searchParams || {}).length)notFound();
  const item=await getAdsContent(access.db,actor,(await params).contentId);if(!item)notFound();
  const [files,canRestrict,history]=await Promise.all([listContentFiles(access.db,actor,item.id),canRestrictContentFiles(access.db,actor,item.id),adsCreativeHistory(access.db,actor,item.id)]);
  return <><AdsCreativeDetail item={item} /><FileControls contentId={item.id} ads summary={files} mayManage={item.editable} canRestrict={canRestrict} />
    <Section id="creative-history" title="Activity">{history.items.length?<ol className="bo-activity-list">{history.items.map(row=><ActivityRow key={row.id} event={{id:row.id,actor:row.actorName || 'Team member',occurredAt:row.occurredAt,...describeEvent(row.eventType,JSON.parse(row.metadataJson || '{}'))}} />)}</ol>:<p>No activity to show yet.</p>}{history.hasMore&&<p className="bo-small">Showing the latest 60 available events.</p>}</Section>
  </>;
}
