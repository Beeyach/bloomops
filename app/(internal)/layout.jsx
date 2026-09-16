import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { ROLE_LABELS } from '@/lib/bloomops/membership.mjs';
import InternalShell from '@/components/bloomops/InternalShell';

// The internal application: every route in this group renders inside the
// internal shell, for Owner, Admin, Project Manager, and Team Member.
// requireShell sends anyone else away before any chrome renders: a Client
// to the portal, an identity without an active membership to sign-in, and
// nobody at all to sign-in. Each page below repeats the same call, so a
// client-side navigation that skips this layout is checked just the same.
export const dynamic = 'force-dynamic';

export default async function InternalLayout({ children }) {
  const { access } = await requireShell('internal');
  return (
    <InternalShell membershipId={access.membership.id} workspace={access.workspace} user={access.user} roleLabel={ROLE_LABELS[access.membership.role] || access.membership.role}>
      {children}
    </InternalShell>
  );
}
