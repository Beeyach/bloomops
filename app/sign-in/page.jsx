import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import AuthShell from '@/components/auth/AuthShell';
import { getAccess } from '@/lib/bloomops/access.mjs';
import SignInForm from './SignInForm';
import SignOutButton from './SignOutButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign in · BloomOps' };

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
  const access = await getAccess(await headers());

  if (access?.membership) redirect(next);

  if (access) {
    return (
      <AuthShell
        title="No workspace access"
        lead={`You are signed in as ${access.user.email}, but this account is not an active member of a BloomOps workspace.`}
      >
        <p className="text-[13.5px] text-ink-3 text-balance mb-4">
          If you were invited, open the link in your invitation email. If your access was paused, ask your workspace Owner or Admin.
        </p>
        <SignOutButton />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Sign in"
      lead="Enter your email and we will send you a link. No password needed."
      footer="BloomOps is invitation-only. If you do not have access yet, ask the agency that works with you."
    >
      {problem && <p role="alert" className="text-[13px] text-poppy-text mb-3 text-balance">{problem}</p>}
      <SignInForm next={next} />
    </AuthShell>
  );
}
