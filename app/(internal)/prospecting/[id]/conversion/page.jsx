import {getProspect} from '@/lib/bloomops/prospects.mjs';
import {evaluate} from '@/lib/bloomops/authorization.mjs';
import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {getConversionOptions} from '@/lib/bloomops/prospect-conversion-preview.mjs';
import {getProspectConversion} from '@/lib/bloomops/prospect-conversions.mjs';
import ProspectConversionPreview from '@/components/bloomops/ProspectConversionPreview';
export const dynamic='force-dynamic';
export const metadata={title:'Client handoff review'};
export default async function ConversionPage({params}){
 const {access,actor}=await requireShell('internal');const data=await getConversionOptions(access.db,actor,(await params).id);if(!data.ok)notFound();
 const saved=await getProspectConversion(access.db,actor,(await params).id);if(!saved.ok)notFound();
 const profile=await getProspect(access.db,actor,data.profile.id);if(!profile)notFound();
 return <ProspectConversionPreview key={JSON.stringify([actor.userId,actor.workspaceId,data.profile.id])} userId={actor.userId} initialProfile={profile} initial={{...data,canManageTemplates:evaluate(actor,{action:'templates.manage'}).allowed,canManageOfferings:evaluate(actor,{action:'workspace.settings'}).allowed,receipt:saved.receipt}}/>;
}
