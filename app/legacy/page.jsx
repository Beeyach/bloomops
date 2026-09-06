import { STAGES, RATINGS, COUNTRIES, SOURCES, REPLY_TYPES } from '@/lib/db';
import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import ProspectsApp from '@/components/ProspectsApp';

// The inherited Leadsthatbloom application, kept reachable by address for
// workspace administrators while later phases retire it piece by piece
// (the Pages editor inside it is the part worth keeping). It is not in
// BloomOps navigation, not a BloomOps module, and not the home of anyone:
// requireShell('legacy') sends a Client to the portal and answers not
// found for every internal role the engine does not admit to
// legacy.prospecting (Owner and Admin). Its data routes keep the same
// fence in lib/workspace.mjs, so rendering this is never the boundary.
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Inherited prospecting application' };

export default async function LegacyPage() {
  await requireShell('legacy');
  return <ProspectsApp stages={STAGES} ratings={RATINGS} countries={COUNTRIES} sources={SOURCES} replyTypes={REPLY_TYPES} />;
}
