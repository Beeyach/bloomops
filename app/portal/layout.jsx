import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import PortalShell from '@/components/bloomops/PortalShell';

// The client portal: its own route tree and its own chrome, for Client
// members only. requireShell('portal') sends an internal person back to
// the internal application (they never become a portal user by opening
// this address) and everyone without an active membership to sign-in.
export const dynamic = 'force-dynamic';

export default async function PortalLayout({ children }) {
  const { access } = await requireShell('portal');
  return (
    <PortalShell workspace={access.workspace} user={access.user}>
      {children}
    </PortalShell>
  );
}
