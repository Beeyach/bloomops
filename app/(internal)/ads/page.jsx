import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { navItem } from '@/lib/bloomops/navigation.mjs';
import { AreaPreview } from '@/components/bloomops/Primitives';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ads' };

export default async function AdsPage() {
  await requireShell('internal');
  return (
    <AreaPreview
      title="Ads"
      purpose={navItem('ads').purpose}
      items={[
        ['Campaigns', 'What is running for each client, and its state.'],
        ['Creative', 'Ad creative sets, with client approval inside each one.'],
        ['Performance', 'Spend, leads, bookings, and cost per result, kept light.'],
      ]}
    />
  );
}
