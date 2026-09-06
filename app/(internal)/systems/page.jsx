import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { navItem } from '@/lib/bloomops/navigation.mjs';
import { AreaPreview } from '@/components/bloomops/Primitives';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Systems' };

export default async function SystemsPage() {
  await requireShell('internal');
  return (
    <AreaPreview
      title="Systems"
      purpose={navItem('systems').purpose}
      items={[
        ['GHL builds', 'Funnels, forms, calendars, pipelines, automations, and messaging, through QA to launch.'],
        ['Kajabi builds', 'Course, checkout, nurture, and launch.'],
        ['Deliverables', 'What the client actually receives: a funnel, a course, a sequence, an automation.'],
        ['QA and handoff', 'Checks before launch, and what the client is given at the end.'],
      ]}
    />
  );
}
