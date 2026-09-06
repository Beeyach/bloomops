import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { navItem } from '@/lib/bloomops/navigation.mjs';
import { AreaPreview } from '@/components/bloomops/Primitives';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Social' };

export default async function SocialPage() {
  await requireShell('internal');
  return (
    <AreaPreview
      title="Social"
      purpose={navItem('social').purpose}
      items={[
        ['Content items', 'Reels, posts, carousels, stories, and emails as structured work, not documents.'],
        ['Pipeline', 'Idea, script, recording, editing, review, approval, scheduled, published.'],
        ['Client approvals', 'Inside each item, with the history kept.'],
        ['Calendar', 'What is scheduled, by client and channel.'],
      ]}
    />
  );
}
