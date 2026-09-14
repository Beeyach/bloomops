import {getProspectSheetFacts} from '@/lib/bloomops/prospect-sheet.mjs';
import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {getProspect} from '@/lib/bloomops/prospects.mjs';
import {getProspectConversion} from '@/lib/bloomops/prospect-conversions.mjs';
import ProspectProfile from '@/components/bloomops/ProspectProfile';
export const dynamic='force-dynamic';
export const metadata={title:'Prospect profile'};
export default async function ProspectPage({params,searchParams}){const {access,actor}=await requireShell('internal');const {id}=await params;const query=await searchParams;const data=await getProspect(access.db,actor,id,{activityPage:Number(query.activityPage||1)});if(!data)notFound();const saved=await getProspectConversion(access.db,actor,id);if(!saved.ok)notFound();return <ProspectProfile key={JSON.stringify([actor.userId,actor.workspaceId,id])} userId={actor.userId} initial={{...data,conversion:saved.receipt,sheetFacts:await getProspectSheetFacts(access.db,actor,id)}}/>;}
