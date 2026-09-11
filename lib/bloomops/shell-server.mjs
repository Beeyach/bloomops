// The server-component side of lib/bloomops/shell.mjs: read the request
// headers, resolve the shell decision, and turn it into a redirect, a
// not-found, or the access the page renders with.
//
// Layout and page both call this for the same request. React's cache()
// makes the second call free (one joined session/user/membership lookup,
// one actor load per request); on a client-side navigation only the page
// segment renders, so every page re-checks on its own and the layout is
// never the only fence.
import * as React from 'react';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { resolveShellAccess } from './shell.mjs';

const memo = typeof React.cache === 'function' ? React.cache : (fn) => fn;

const resolveForArea = memo(async (area) => resolveShellAccess(await headers(), { area }));

// `area` is 'internal', 'portal', or 'legacy'. Returns { access, actor }
// or never returns (redirect / not found).
export async function requireShell(area) {
  const decision = await resolveForArea(area);
  if (decision.kind === 'redirect') redirect(decision.to);
  if (decision.kind !== 'ok') notFound();
  return { access: decision.access, actor: decision.actor };
}
