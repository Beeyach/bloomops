import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {reviewProspectOnboarding} from '@/lib/bloomops/prospect-onboarding.mjs';
import ProspectOnboarding from '@/components/bloomops/ProspectOnboarding';
export const metadata={title:'Client onboarding setup'};
export default async function Page({params}){const {access,actor}=await requireShell('internal'),{id}=await params;const result=await reviewProspectOnboarding(access.db,actor,id);if(!result)notFound();return <ProspectOnboarding workspaceId={actor.workspaceId} prospectId={id} initial={result}/>;}
