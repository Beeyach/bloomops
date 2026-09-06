import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import AuthShell from '@/components/auth/AuthShell';
import { getAccessOrProblem } from '@/lib/bloomops/access.mjs';
import { Notice } from '@/components/bloomops/Primitives';
import SignInForm from './SignInForm';
import SignOutButton from './SignOutButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign in' };

// Only a same-origin path may be resumed after sign-in.
function safeNext(raw) {
  const value = String(raw || '');
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  return value;
}

// What a failed link verification says. Better Auth appends its error code
// to the errorCallbackURL; none of these messages reveals whether an
// address is known.
function linkProblem(code) {
  if (!code) return null;
  if (code === 'INVALID_TOKEN') {
    return 'That sign-in link is not valid any more. Links work once and expire after 15 minutes. Request a new one below.';
  }
  if (code === 'NOT_INVITED') {
    return 'That invitation is no longer valid. Ask your workspace admin for a new one, then sign in again.';
  }
  return 'Sign-in did not complete. Request a new link below.';
}

export default async function SignInPage({ searchParams }) {
  const params = (await searchParams) || {};
  const next = safeNext(params.next);
  const problem = linkProblem(String(params.error || ''));
  const { access, configured } = await getAccessOrProblem(await headers());

  if (!configured) {
    return (
      <AuthShell
        title="Sign-in is not set up"
        lead="This deployment has no authentication configuration yet, so nobody can sign in. An administrator needs to set its auth secret and app URL."
      />
    );
  }

  if (access?.membership) redirect(next);

  if (access) {
    return (
      <AuthShell
        title="No workspace access"
        lead={`You are signed in as ${access.user.email}, but this account is not an active member of a BloomOps workspace.`}
      >
        <p className="bo-body" style={{ marginBottom: 16 }}>
          If you were invited, open the link in your invitation email. If your access was paused, ask your workspace Owner or Admin.
        </p>
        <SignOutButton block />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Sign in"
      lead="Enter your email and we will send you a link. No password needed."
      footer="BloomOps is invitation-only. If you do not have access yet, ask the agency that works with you."
    >
      {problem && (
        <Notice tone="error" className="bo-auth-problem">
          {problem}
        </Notice>
      )}
      <SignInForm next={next} />
    </AuthShell>
  );
}
