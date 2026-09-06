import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { financeViewFor } from '@/lib/bloomops/shell.mjs';
import { navItem } from '@/lib/bloomops/navigation.mjs';
import { AreaPreview, PageHeader, Surface } from '@/components/bloomops/Primitives';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Finance' };

// Finance is in the map for everyone and open only to people the engine
// says hold finance.view (the Owner by role; Admin, Project Manager, and
// Team Member only by explicit grant). Without it the page says so and
// describes nothing. With it, the area is still a placeholder: no records
// exist in Release A.
export default async function FinancePage() {
  const { actor } = await requireShell('internal');
  if (financeViewFor(actor) !== 'preview') {
    return (
      <>
        <PageHeader title="Finance" />
        <Surface tone="mist" padding="lg" className="bo-page-narrow">
          <p className="bo-body">
            Finance is open to the workspace Owner and to people who have been given finance access. It is not open to you. If you need it, ask your workspace Owner.
          </p>
        </Surface>
      </>
    );
  }
  return (
    <AreaPreview
      title="Finance"
      purpose={navItem('finance').purpose}
      items={[
        ['Per client and service', 'Package, amount, invoice and payment state, due and paid dates.'],
        ['Renewals', 'What comes up for renewal and when.'],
        ['Kept light', 'No accounting, tax, payroll, or reconciliation.'],
      ]}
    />
  );
}
