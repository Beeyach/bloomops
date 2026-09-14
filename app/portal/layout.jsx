import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import {hasSharedPages} from '@/lib/bloomops/pages.mjs';
import PortalShell from '@/components/bloomops/PortalShell';
import { hasPortalContent } from '@/lib/bloomops/portal-content.mjs';

// The client portal: its own route tree and its own chrome, for Client
// members only. requireShell('portal') sends an internal person back to
// the internal application (they never become a portal user by opening
// this address) and everyone without an active membership to sign-in.
export const dynamic = 'force-dynamic';

export default async function PortalLayout({ children }) {
  const { access, actor } = await requireShell('portal');
  const [hasContent,hasPages]=await Promise.all([hasPortalContent(access.db,actor),hasSharedPages(access.db,actor)]);
  return (
    <PortalShell workspace={access.workspace} user={access.user} hasContent={hasContent} hasPages={hasPages}>
      {children}
    </PortalShell>
  );
}
