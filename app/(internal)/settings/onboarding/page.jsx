import {getClient} from '@/lib/bloomops/clients.mjs';
import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {onboardingSetup} from '@/lib/bloomops/onboarding-setup.mjs';
import {PageHeader,Button} from '@/components/bloomops/Primitives';
import OnboardingSetup from '@/components/bloomops/OnboardingSetup';
export const dynamic='force-dynamic';
export default async function Page({searchParams}){const query=await searchParams;const {access,actor}=await requireShell('internal'),data=await onboardingSetup(access.db,actor);if(!data.ok)notFound();const client=query?.workspaceId===actor.workspaceId&&typeof query?.clientId==='string'?await getClient(access.db,actor,query.clientId):null;return <><Button href="/settings" variant="ghost">Back to settings</Button><PageHeader title="Onboarding defaults" subtitle="Review and install missing onboarding instructions"/>{client&&<div className="bo-setup-return"><p>Preparing onboarding for {client.name}. No invitation is sent here.</p><Button href={'/clients/'+client.id}>Return to {client.name}</Button></div>}<OnboardingSetup key={`${actor.workspaceId}:${actor.userId}`} initial={data}/></>;}
