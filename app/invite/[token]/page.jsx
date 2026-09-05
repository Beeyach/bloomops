import { headers } from 'next/headers';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import AuthShell from '@/components/auth/AuthShell';
import { getAccessOrProblem } from '@/lib/bloomops/access.mjs';
import { bloomOpsDb } from '@/lib/bloomops/db.mjs';
import { lookupInvitation } from '@/lib/bloomops/invitations.mjs';
import { ROLE_LABELS, normalizeEmail } from '@/lib/bloomops/membership.mjs';
import SignInForm from '../../sign-in/SignInForm';
import SignOutButton from '../../sign-in/SignOutButton';
import AcceptInvitation from './AcceptInvitation';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Invitation · BloomOps' };

// The invitation link lands here. The page is reachable without a session
// (the middleware exempts exactly this shape) because the person usually has
// no identity yet. What it shows before sign-in is limited to whether the
// link is usable and which workspace and role it is for.
export default async function InvitePage({ params }) {
  const { token } = await params;
  const { env } = getCloudflareContext();
  const db = bloomOpsDb(env.DB);
  const looked = await lookupInvitation(db, token);

  if (looked.state === 'invalid') {
    return <AuthShell title="Invitation not found" lead="This invitation link is not valid. Check the link in your email, or ask for a new invitation." />;
  }
  if (looked.state === 'expired') {
    return <AuthShell title="Invitation expired" lead="This invitation has expired. Ask your workspace Owner or Admin to send a new one." />;
  }
  if (looked.state === 'revoked') {
    return <AuthShell title="Invitation withdrawn" lead="This invitation is no longer open." />;
  }
  if (looked.state === 'accepted') {
    return (
      <AuthShell title="Already accepted" lead="This invitation has already been used.">
        <a href="/sign-in" className="block text-center btn-bloom font-medium rounded-[10px] py-3 text-[14px]">Sign in</a>
      </AuthShell>
    );
  }

  const { invitation, workspace } = looked;
  const roleLabel = ROLE_LABELS[invitation.role] || invitation.role;
  const { access, configured } = await getAccessOrProblem(await headers());

  if (!configured) {
    return <AuthShell title="Sign-in is not set up" lead="This deployment has no authentication configuration yet, so the invitation cannot be accepted here. An administrator needs to set its auth secret and app URL." />;
  }

  if (!access) {
    return (
      <AuthShell
        title={`Join ${workspace.name}`}
        lead={`You have been invited to join ${workspace.name} on BloomOps as ${roleLabel}. Sign in with the invited email address to accept.`}
      >
        <SignInForm next={`/invite/${token}`} buttonLabel="Email me a link to accept" />
      </AuthShell>
    );
  }

  if (normalizeEmail(access.user.email) !== invitation.email) {
    return (
      <AuthShell
        title="Different email address"
        lead={`This invitation was sent to a different address than the one you are signed in with (${access.user.email}). Sign out, then open the link again and sign in with the invited address.`}
      >
        <SignOutButton next={`/invite/${token}`} label="Sign out and try again" />
      </AuthShell>
    );
  }

  return (
    <AuthShell title={`Join ${workspace.name}`} lead={`Signed in as ${access.user.email}.`}>
      <AcceptInvitation token={token} workspaceName={workspace.name} roleLabel={roleLabel} />
    </AuthShell>
  );
}
