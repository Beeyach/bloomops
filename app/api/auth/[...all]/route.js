import { getAuth } from '@/lib/bloomops/auth.mjs';

export const dynamic = 'force-dynamic';

// Better Auth's endpoints, mounted at /api/auth/*: magic-link request and
// verification, get-session, sign-out. Only GET and POST exist for the
// flows BloomOps enables. Everything BloomOps-specific (membership,
// invitations) lives under /api/bloomops and checks the session itself.
async function handle(req) {
  const auth = getAuth({ requestUrl: req.url });
  return auth.handler(req);
}

export { handle as GET, handle as POST };
