import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {getPublishedReport,reportPublicationReview} from '@/lib/bloomops/client-report-publications.mjs';
import PublishedReport from '@/components/bloomops/PublishedReport';
import {Button} from '@/components/bloomops/Primitives';
export const dynamic='force-dynamic';
export default async function Page({params}){const {id,reportId,publicationId}=await params,{access,actor}=await requireShell('internal');if(!await reportPublicationReview(access.db,actor,id,reportId))notFound();const report=await getPublishedReport(access.db,actor,publicationId);if(!report||report.reportId!==reportId)notFound();return <><Button href={`/clients/${id}/reports/${reportId}/publication`}>Back to publication history</Button><p>Internal history. Earlier or withdrawn versions are not available through client links.</p><PublishedReport key={`${actor.userId}:${actor.workspaceId}:${publicationId}`} initial={report} scope={{userId:actor.userId,workspaceId:actor.workspaceId}} api={`/api/bloomops/clients/${id}/reports/${reportId}/versions/${publicationId}`}/></>;}
