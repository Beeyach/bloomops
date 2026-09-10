import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { readTogether } from '@/lib/bloomops/read-batch.mjs';
import { contentFilters, contentOptions, listContent } from '@/lib/bloomops/content.mjs';
import { ContentList } from '@/components/bloomops/ContentViews';
import { Button, Notice, PageHeader } from '@/components/bloomops/Primitives';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Social' };
export default async function SocialPage({ searchParams }) {
  const { access, actor } = await requireShell('internal');
  const query = await searchParams || {};
  // Invalid filters retain the existing no-data error path. Valid list and
  // choice reads independently enforce current authority and can overlap.
  const [result, options] = await readTogether(access.db, db => Promise.all([
    listContent(db, actor, query),
    contentFilters(query).ok ? contentOptions(db, actor) : null,
  ]));
  if (!result.ok) return <><PageHeader title="Social" /><Notice tone="error">Choose only the available Content filters.</Notice><Button href="/social">Reset filters</Button></>;
  return <ContentList result={result} query={query} options={options} />;
}
