import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { contentOptions, listContent } from '@/lib/bloomops/content.mjs';
import { ContentList } from '@/components/bloomops/ContentViews';
import { Button, Notice } from '@/components/bloomops/Primitives';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Social' };
export default async function SocialPage({ searchParams }) {
  const { access, actor } = await requireShell('internal');
  const query = await searchParams || {};
  const result = await listContent(access.db, actor, query);
  if (!result.ok) return <><Notice tone="error">Choose only the available Content filters.</Notice><Button href="/social">Reset filters</Button></>;
  const options = await contentOptions(access.db, actor);
  return <ContentList result={result} query={query} options={options} />;
}
