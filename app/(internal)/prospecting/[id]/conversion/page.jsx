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
 return <ProspectConversionPreview initial={{...data,receipt:saved.receipt}}/>;
}
