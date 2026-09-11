// Pure proposal only. Logical references are NOT database IDs or permission.
// Later preparation must load trusted configuration and recompile; later writes
// must prove an authorized, exact committed receipt before reporting success.
import { compareKeys } from './onboarding-definition.mjs';
import { blueprintArray, blueprintByteLength, blueprintFail, exactBlueprintObject,
  SYSTEMS_BLUEPRINT_LIMITS, validateSystemsBlueprintDefinition } from './systems-blueprint-definition.mjs';

// Fixed Work Core initial values, never accepted from blueprint/caller input.
export const SYSTEMS_BLUEPRINT_INITIAL = Object.freeze({
  milestoneStatus: 'upcoming', actionStatus: 'to_do', deliverableStatus: 'planned',
  visibility: 'internal', priority: 'normal',
});

export function compileSystemsBlueprint(input) {
  if (!exactBlueprintObject(input, ['definition', 'selectedComponentKeys'])) blueprintFail('invalid_input');
  const definition = validateSystemsBlueprintDefinition(input.definition);
  const selection = input.selectedComponentKeys;
  if (!blueprintArray(selection, SYSTEMS_BLUEPRINT_LIMITS.components, 1)) blueprintFail('invalid_selection');
  const available = new Set(definition.components.map(row => row.logicalKey));
  if (selection.some(key => typeof key !== 'string' || !available.has(key)) || new Set(selection).size !== selection.length) blueprintFail('invalid_selection');
  const selected = new Set(selection);
  const components = definition.components.filter(row => selected.has(row.logicalKey));
  const milestoneKeys = new Set(components.map(row => row.milestoneKey));
  const actionKeys = new Set(components.map(row => row.actionKey));
  const actionByKey = new Map(definition.actions.map(row => [row.logicalKey, row]));
  const deliverableByKey = new Map(definition.deliverables.map(row => [row.logicalKey, row]));
  const initial = SYSTEMS_BLUEPRINT_INITIAL;
  const milestones = definition.milestones.filter(row => milestoneKeys.has(row.logicalKey)).map((row, index) => ({
    logicalKey: row.logicalKey, name: row.name, position: (index + 1) * 10,
    status: initial.milestoneStatus, visibility: initial.visibility,
  }));
  const actions = components.map(row => ({ ...actionByKey.get(row.actionKey), milestoneKey: row.milestoneKey,
    status: initial.actionStatus, visibility: initial.visibility, priority: initial.priority }));
  const deliverables = components.filter(row => row.deliverableKey !== null).map(row => ({
    ...deliverableByKey.get(row.deliverableKey), status: initial.deliverableStatus, visibility: initial.visibility,
  }));
  const groups = definition.dependencyGroups.map(group => group.filter(key => actionKeys.has(key))).filter(group => group.length);
  const dependencies = [];
  for (let i = 1; i < groups.length; i++) for (const actionKey of groups[i]) {
    for (const dependsOnActionKey of groups[i - 1]) dependencies.push({ actionKey, dependsOnActionKey });
  }
  dependencies.sort((a, b) => compareKeys(a.actionKey, b.actionKey) || compareKeys(a.dependsOnActionKey, b.dependsOnActionKey));
  const plan = { schemaVersion: definition.schemaVersion, compilerVersion: definition.compilerVersion,
    blueprintKey: definition.blueprintKey, selectedComponentKeys: components.map(row => row.logicalKey),
    milestones, actions, deliverables, dependencies };
  if (milestones.length + actions.length + deliverables.length > SYSTEMS_BLUEPRINT_LIMITS.planRecords
    || dependencies.length > SYSTEMS_BLUEPRINT_LIMITS.dependencies
    || blueprintByteLength(plan) > SYSTEMS_BLUEPRINT_LIMITS.planBytes) blueprintFail('plan_too_large');
  return plan;
}
