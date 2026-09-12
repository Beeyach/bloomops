import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { navItem } from '@/lib/bloomops/navigation.mjs';
import { AreaPreview } from '@/components/bloomops/Primitives';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pages' };

// The Notion-style Page editor exists and stays intact (docs/PAGES_SYSTEM.md);
// bringing it into the BloomOps shell with workspace-scoped, client-safe
// visibility is its own phase. Until then Pages is a mapped destination
// with nothing live behind it.
export default async function PagesPage() {
  await requireShell('internal');
  return (
    <AreaPreview
      title="Pages"
      purpose={navItem('pages').purpose}
      items={[
        ['SOPs', 'How the agency does things, written once.'],
        ['Client documentation', 'Welcome kits, strategy, brand guidelines, shared on purpose.'],
        ['Briefs and meeting notes', 'Freeform writing that belongs beside the work, not inside it.'],
      ]}
      note="Pages are not available in Bloomsi yet. The editor behind them is ready; connecting it to this workspace, with the right visibility for clients, is a later step."
    />
  );
}
