import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { ACTIONS } from '@/lib/bloomops/authorization.mjs';
import { adsProjection } from '@/lib/bloomops/ads.mjs';
import { Button, Notice, PageHeader } from '@/components/bloomops/Primitives';
import { AdsOverview } from '@/components/bloomops/AdsOverview';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ads' };

export default async function AdsPage({ searchParams }) {
  const { access, actor } = await requireShell('internal');
  const projection = await adsProjection(access.db, actor, await searchParams || {});
  return <>
    <PageHeader title="Ads" subtitle="Campaign delivery, next steps and outputs across your Ads services."
      actions={ACTIONS['project.create'].roles.includes(actor.role) && <Button href="/work/projects/new">Create project in Work</Button>} />
    {projection.ok ? <AdsOverview projection={projection} /> : <Notice tone="error">
      <p>Those filters are unavailable. <a className="bo-link" href="/ads">Reset filters</a></p>
    </Notice>}
  </>;
}
