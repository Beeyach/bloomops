import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { listClients } from '@/lib/bloomops/clients.mjs';
import { PageHeader } from '@/components/bloomops/Primitives';
import { OnboardingClients } from '@/components/bloomops/OnboardingClients';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Onboarding' };

export default async function OnboardingPage() {
  const { access, actor } = await requireShell('internal');
  // Reuse the canonical Client scope. A service assignment alone does not
  // grant access to a Client or its onboarding checklist.
  const result = await listClients(access.db, actor);
  return <>
    <PageHeader title="Onboarding" subtitle="Open a Client's checklist to review its setup, required steps and current progress." />
    <OnboardingClients clients={result.clients} total={result.total} />
  </>;
}
