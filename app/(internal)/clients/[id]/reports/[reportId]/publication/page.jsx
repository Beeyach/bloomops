import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {reportPublicationReview,listPublishedReports} from '@/lib/bloomops/client-report-publications.mjs';
import ReportPublication from '@/components/bloomops/ReportPublication';
export const dynamic='force-dynamic';
export default async function Page({params}){const {id,reportId}=await params,{access,actor}=await requireShell('internal'),review=await reportPublicationReview(access.db,actor,id,reportId);if(!review)notFound();const history=await listPublishedReports(access.db,actor,{clientId:id,reportId});return <ReportPublication key={`${actor.userId}:${actor.workspaceId}:${reportId}`} initial={{review,history}} clientId={id} reportId={reportId} scope={{userId:actor.userId,workspaceId:actor.workspaceId}}/>;}
