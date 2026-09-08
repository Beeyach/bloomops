import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { homeProjection } from '@/lib/bloomops/work-projections.mjs';
import { Button, PageHeader } from '@/components/bloomops/Primitives';
import { OperationalHome } from '@/components/bloomops/OperationalHome';

// A fresh, bounded read of canonical work, with no dashboard state or writes.
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Home' };

export default async function HomePage() {
  const { access, actor } = await requireShell('internal');
  const projection = await homeProjection(access.db, actor);
  return (
    <>
      <PageHeader title="Home" subtitle={`${access.workspace.name} · What needs attention across your work.`} actions={<Button href="/work">My work</Button>} />
      <OperationalHome projection={projection} />
    </>
  );
}
