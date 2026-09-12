import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {getProspect} from '@/lib/bloomops/prospects.mjs';
import ProspectProfile from '@/components/bloomops/ProspectProfile';
export const dynamic='force-dynamic';
export const metadata={title:'Prospect profile'};
export default async function ProspectPage({params,searchParams}){const {access,actor}=await requireShell('internal');const {id}=await params;const query=await searchParams;const data=await getProspect(access.db,actor,id,{activityPage:Number(query.activityPage||1)});if(!data)notFound();return <ProspectProfile initial={data}/>;}
