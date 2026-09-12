import { notFound } from 'next/navigation';
import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { systemsBlueprintSetupOptions } from '@/lib/bloomops/systems-blueprint-setup.mjs';
import { Button, PageHeader } from '@/components/bloomops/Primitives';
import SystemsBuildSetup from '@/components/bloomops/SystemsBuildSetup';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Kajabi build setup' };
export default async function KajabiBuildSetupPage() {
  const { access, actor } = await requireShell('internal');
  const options = await systemsBlueprintSetupOptions(access.db, { actor, blueprintKey: 'kajabi_build' });
  if (!options.ok) notFound();
  return <>
    <Button href="/settings" variant="ghost" size="sm">Back to settings</Button>
    <PageHeader title="Kajabi build setup" subtitle="Choose which Systems services can use the Kajabi build workflow." />
    <SystemsBuildSetup key="kajabi" options={options} platform="Kajabi" endpoint="/api/bloomops/systems/kajabi-setup" />
  </>;
}
