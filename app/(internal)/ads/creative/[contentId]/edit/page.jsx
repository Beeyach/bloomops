import { notFound } from 'next/navigation';
import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { getAdsContent, adsCreativeOptions } from '@/lib/bloomops/ads-creative.mjs';
import ContentForm from '@/components/bloomops/ContentForm';
import ContentPlatforms from '@/components/bloomops/ContentPlatforms';
import { Button, PageHeader } from '@/components/bloomops/Primitives';
export const dynamic='force-dynamic';
export const metadata={title:'Edit Ads creative'};
export default async function EditCreativePage({params,searchParams}) {
  const {access,actor}=await requireShell('internal');if(Object.keys(await searchParams || {}).length)notFound();
  const item=await getAdsContent(access.db,actor,(await params).contentId);if(!item || !item.editable)notFound();
  const options=await adsCreativeOptions(access.db,actor,{projectId:item.adsProjectId});if(!options)notFound();
  return <><Button href={`/ads/creative/${item.id}`} variant="ghost">Back to creative</Button><PageHeader title="Edit creative" subtitle={`Project: ${item.projectName}`} /><ContentForm area="ads" item={item} options={options} /><ContentPlatforms item={item} base="/ads/creative" /></>;
}
