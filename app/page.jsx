import { STAGES, RATINGS, COUNTRIES, SOURCES, REPLY_TYPES } from '@/lib/db';
import ProspectsApp from '@/components/ProspectsApp';

// The page itself doesn't touch the DB, but it renders per-request app
// state, so it must never be prerendered at build time.
export const dynamic = 'force-dynamic';

export default function Page() {
  // Note: the old version called getDb() here to trigger schema creation on
  // first request. With D1, the schema is applied separately via
  // `wrangler d1 execute` — no per-request setup needed.
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
