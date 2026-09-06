import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { STAGES, RATINGS, COUNTRIES, SOURCES, REPLY_TYPES } from '@/lib/db';
import AuthShell from '@/components/auth/AuthShell';
import { getAccessOrProblem } from '@/lib/bloomops/access.mjs';
import { ROLE_LABELS } from '@/lib/bloomops/membership.mjs';
import { legacyAppAllowed } from '@/lib/workspace.mjs';
import SignOutButton from './sign-in/SignOutButton';
import ProspectsApp from '@/components/ProspectsApp';

// Rendered per request: it checks who is asking before it renders anything.
// The middleware only looked for a cookie; this is the real check, session
// and ACTIVE workspace membership, the same one every data route makes.
//
// The inherited prospecting application is transitional and its data
// routes know nothing of assignment or client scope, so (as in
// lib/workspace.mjs) it renders for workspace administrators only. Every
// other member gets a plain holding screen until A5 gives their role a
// home. Not rendering the app is not the security boundary; the routes
// behind it refuse those roles on their own.
export const dynamic = 'force-dynamic';

export default async function Page() {
  const { access } = await getAccessOrProblem(await headers());
  if (!access || !access.membership) redirect('/sign-in');
  if (!legacyAppAllowed(access)) {
    const roleLabel = ROLE_LABELS[access.membership.role] || access.membership.role;
    return (
      <AuthShell
        title="Nothing here yet"
        lead={`You are signed in to ${access.workspace.name} as ${roleLabel}. The BloomOps screens for your role are not ready yet; your workspace Owner or Admin will let you know when they are.`}
      >
        <SignOutButton />
      </AuthShell>
    );
  }
  return (
    <ProspectsApp
      stages={STAGES}
      ratings={RATINGS}
      countries={COUNTRIES}
      sources={SOURCES}
      replyTypes={REPLY_TYPES}
    />
  );
}
