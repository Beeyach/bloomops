import { notFound } from 'next/navigation';
import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { systemsBlueprintSetupOptions } from '@/lib/bloomops/systems-blueprint-setup.mjs';
import { Button, PageHeader } from '@/components/bloomops/Primitives';
import GhlBuildSetup from '@/components/bloomops/GhlBuildSetup';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'GHL build setup' };
export default async function GhlBuildSetupPage() {
  const { access, actor } = await requireShell('internal');
  const options = await systemsBlueprintSetupOptions(access.db, { actor });
  if (!options.ok) notFound();
  return <>
    <Button href="/settings" variant="ghost" size="sm">Back to settings</Button>
    <PageHeader title="GHL build setup" subtitle="Choose which Systems services can use the GHL build workflow." />
    <GhlBuildSetup options={options} />
  </>;
}
