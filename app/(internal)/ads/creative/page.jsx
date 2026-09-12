import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { listAdsCreative, adsCreativeFacets } from '@/lib/bloomops/ads-creative.mjs';
import { AdsCreativeList, AdsNavigation } from '@/components/bloomops/AdsCreative';
import { Notice, PageHeader } from '@/components/bloomops/Primitives';
export const dynamic='force-dynamic';
export const metadata={title:'Ads creative'};
export default async function CreativePage({searchParams}) {
  const {access,actor}=await requireShell('internal');
  const result=await listAdsCreative(access.db,actor,await searchParams || {});
  if(!result.ok)return <><PageHeader title="Ads creative" /><AdsNavigation creative /><Notice tone="error">Those filters are unavailable. <a href="/ads/creative">Reset filters</a></Notice></>;
  return <AdsCreativeList result={result} facets={await adsCreativeFacets(access.db,actor)} />;
}
