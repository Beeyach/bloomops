import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {getPageTemplate} from '@/lib/bloomops/page-templates.mjs';
import {renderPageDocument} from '@/lib/bloomops/page-document.mjs';
import {PageTemplatePreview} from '@/components/bloomops/PageTemplates';
export const dynamic='force-dynamic';
export default async function Page({params}){const {access,actor}=await requireShell('internal'),versionId=(await params).versionId,t=await getPageTemplate(access.db,actor,versionId);if(!t)notFound();return <PageTemplatePreview key={JSON.stringify([actor.userId,actor.workspaceId,versionId])} initial={{...t,body:renderPageDocument(t.body)}} scope={{userId:actor.userId,workspaceId:actor.workspaceId}}/>;}
