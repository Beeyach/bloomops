import { GHL_BUILD_BLUEPRINT_V1 } from './systems-blueprint-defaults.mjs';
import { KAJABI_BUILD_BLUEPRINT_V1 } from './systems-blueprint-kajabi.mjs';
// Closed server-owned metadata. Service labels/slugs never select a blueprint.
const defaults = Object.freeze({
  ghl_build: Object.freeze({ slug: 'ghl-build', name: 'GHL build', definition: GHL_BUILD_BLUEPRINT_V1 }),
  kajabi_build: Object.freeze({ slug: 'kajabi-build', name: 'Kajabi build', definition: KAJABI_BUILD_BLUEPRINT_V1 }),
});
export const systemsBlueprintDefault = key => typeof key === 'string' && Object.hasOwn(defaults, key) ? defaults[key] : null;
