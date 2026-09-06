import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { STAGES, RATINGS, COUNTRIES, SOURCES, REPLY_TYPES } from '@/lib/db';
import { getAccessOrProblem } from '@/lib/bloomops/access.mjs';
import ProspectsApp from '@/components/ProspectsApp';

// Rendered per request: it checks who is asking before it renders anything.
// The middleware only looked for a cookie; this is the real check, session
// and ACTIVE workspace membership, the same one every data route makes.
export const dynamic = 'force-dynamic';

export default async function Page() {
  const { access } = await getAccessOrProblem(await headers());
  if (!access || !access.membership) redirect('/sign-in');
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
