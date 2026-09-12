import { systemsSetupHandlers } from '@/lib/bloomops/systems-setup-api.mjs';
import { configureKajabiBlueprint } from '@/lib/bloomops/systems-blueprint-setup.mjs';
export const dynamic = 'force-dynamic';
const handlers = systemsSetupHandlers({ configure: configureKajabiBlueprint, blueprintKey: 'kajabi_build', platform: 'Kajabi' });
export const GET = handlers.GET;
export const POST = handlers.POST;
