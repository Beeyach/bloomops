import { systemsSetupHandlers } from '@/lib/bloomops/systems-setup-api.mjs';
import { configureGhlBlueprint } from '@/lib/bloomops/systems-blueprint-setup.mjs';
export const dynamic = 'force-dynamic';
const handlers = systemsSetupHandlers({ configure: configureGhlBlueprint, blueprintKey: 'ghl_build', platform: 'GHL' });
export const GET = handlers.GET;
export const POST = handlers.POST;
