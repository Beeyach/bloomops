import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {getPublishedReport} from '@/lib/bloomops/client-report-publications.mjs';
import PublishedReport from '@/components/bloomops/PublishedReport';
import {Button} from '@/components/bloomops/Primitives';
export const dynamic='force-dynamic';
export default async function Page({params}){const {publicationId}=await params,{access,actor}=await requireShell('portal'),report=await getPublishedReport(access.db,actor,publicationId,{portal:true});if(!report)notFound();return <><Button href="/portal/reports">All reports</Button><PublishedReport key={`${actor.userId}:${actor.workspaceId}:${publicationId}`} initial={report} scope={{userId:actor.userId,workspaceId:actor.workspaceId}} api={`/api/bloomops/portal/reports/${publicationId}`}/></>;}
