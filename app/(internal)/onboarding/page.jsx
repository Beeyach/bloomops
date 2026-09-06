import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { workspaceOverview } from '@/lib/bloomops/overview.mjs';
import { navItem } from '@/lib/bloomops/navigation.mjs';
import { plural } from '@/lib/bloomops/format.mjs';
import { EmptyState, PageHeader, Surface } from '@/components/bloomops/Primitives';

// Onboarding in A5 is the destination, its place in the hierarchy, and an
// honest initial state. The template engine, requirements, verification,
// and the client-facing checklist arrive in A8 and A10.
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Onboarding' };

export default async function OnboardingPage() {
  const { access, actor } = await requireShell('internal');
  const overview = await workspaceOverview(access.db, actor);
  return (
    <>
      <PageHeader title="Onboarding" subtitle={navItem('onboarding').purpose} />
      {overview.onboardingOpen > 0 ? (
        <Surface tone="mist" padding="lg" className="bo-page-narrow">
          <p className="bo-body">
            <span className="bo-strong bo-num">{plural(overview.onboardingOpen, 'client')}</span> {overview.onboardingOpen === 1 ? 'has' : 'have'} onboarding still open. The checklist itself is not available in BloomOps yet.
          </p>
        </Surface>
      ) : (
        <EmptyState title="Nothing is being onboarded">
          <p>
            Onboarding starts when a client is activated. Each client then gets one checklist built from the services they bought, and this page shows what is still open across every client. No client has reached that point yet.
          </p>
        </EmptyState>
      )}
    </>
  );
}
