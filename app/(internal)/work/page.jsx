import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { navItem } from '@/lib/bloomops/navigation.mjs';
import { AreaPreview } from '@/components/bloomops/Primitives';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Work' };

// A deliberate placeholder: the area exists in the product's map, and the
// shared operational engine behind it (projects, milestones, actions,
// deliverables, requests) is a later release.
export default async function WorkPage() {
  await requireShell('internal');
  return (
    <AreaPreview
      title="Work"
      purpose={navItem('work').purpose}
      items={[
        ['Projects', 'One project per piece of delivery, with milestones and files.'],
        ['Actions', 'Tasks for the team, by client, department, assignee, and due date.'],
        ['Requests', 'What clients ask for, triaged into actions or projects.'],
        ['Templates', 'Reusable blueprints for onboarding and delivery.'],
      ]}
    />
  );
}
