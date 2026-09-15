import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {onboardingSetup} from '@/lib/bloomops/onboarding-setup.mjs';
import {PageHeader,Button} from '@/components/bloomops/Primitives';
import OnboardingSetup from '@/components/bloomops/OnboardingSetup';
export const dynamic='force-dynamic';
export default async function Page(){const {access,actor}=await requireShell('internal'),data=await onboardingSetup(access.db,actor);if(!data.ok)notFound();return <><Button href="/settings" variant="ghost">Back to settings</Button><PageHeader title="Onboarding defaults" subtitle="Review and install missing onboarding instructions"/><OnboardingSetup key={`${actor.workspaceId}:${actor.userId}`} initial={data}/></>;}
