// Pure, bounded blueprint data. No eligibility, identity, storage or authority.
import { canonicalJson, compareKeys, hashDefinitionJson } from './onboarding-definition.mjs';

export const SYSTEMS_BLUEPRINT_SCHEMA_VERSION = 1;
export const SYSTEMS_BLUEPRINT_COMPILER_VERSION = 1;
export const SYSTEMS_BLUEPRINT_LIMITS = Object.freeze({
  components: 14, milestones: 13, actions: 14, deliverables: 8,
  dependencyGroups: 14, dependencies: 49, planRecords: 35,
  logicalKeyLength: 64, titleLength: 120, maxPosition: 2147483647,
  definitionBytes: 32768, planBytes: 32768,
});

export class SystemsBlueprintError extends Error {
  constructor(reason) {
    super('The Systems blueprint could not be compiled.');
    this.name = 'SystemsBlueprintError';
    this.reason = reason;
  }
}
export function blueprintFail(reason = 'invalid_definition') { throw new SystemsBlueprintError(reason); }

// Only JSON-shaped, own data properties: no getters, prototypes carrying
// authority, symbols or silently ignored fields. Never traverse arbitrary JSON.
// Reflection on an exotic/non-JSON input can throw (for example a revoked
// Proxy). Treat that shape as invalid; callers supply the sanitized domain
// reason. Deliberately do not catch definition/compiler/encoding execution.
export function exactBlueprintObject(value, fields) {
  let prototype, keys, descriptors;
  try {
    if (!value) return false;
    prototype = Object.getPrototypeOf(value);
    keys = Reflect.ownKeys(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch { return false; }
  return [Object.prototype, null].includes(prototype)
    && keys.length === fields.length && keys.every(key => fields.includes(key)
      && descriptors[key]?.enumerable && Object.hasOwn(descriptors[key], 'value'));
}
export function blueprintArray(value, max, min = 0) {
  let length, keys, descriptors;
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
    length = value.length;
    if (length < min || length > max) return false;
    keys = Reflect.ownKeys(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch { return false; }
  if (keys.length !== length + 1) return false;
  for (let i = 0; i < length; i++) {
    const descriptor = descriptors[String(i)];
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) return false;
  }
  return true;
}
const keyValid = key => typeof key === 'string' && key.length <= SYSTEMS_BLUEPRINT_LIMITS.logicalKeyLength
  && /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(key);
const titleValid = value => typeof value === 'string' && value.length <= SYSTEMS_BLUEPRINT_LIMITS.titleLength
  && value.trim().length > 0 && !/[\x00-\x1f\x7f\u0085\u2028\u2029]/.test(value);
const positionValid = value => Number.isInteger(value) && value >= 0 && value <= SYSTEMS_BLUEPRINT_LIMITS.maxPosition;
const byPosition = (a, b) => a.position - b.position || compareKeys(a.logicalKey, b.logicalKey);
export const blueprintByteLength = value => new TextEncoder().encode(canonicalJson(value)).byteLength;

// Groups express the approved sequence, with parallel work inside a group.
// Validate the complete graph, not merely the selected portion of a definition.
function validateGroups(groups, actionKeys) {
  const graph = new Map([...actionKeys].map(key => [key, new Set()]));
  const seen = new Set();
  let repeated = false;
  for (const [index, group] of groups.entries()) {
    for (const key of group) {
      if (!actionKeys.has(key)) blueprintFail('dangling_reference');
      if (seen.has(key)) repeated = true;
      seen.add(key);
      if (index) for (const previous of groups[index - 1]) graph.get(key).add(previous);
    }
  }
  const visiting = new Set(), visited = new Set();
  function visit(key) {
    if (visiting.has(key)) blueprintFail('cyclic_dependencies');
    if (visited.has(key)) return;
    visiting.add(key);
    for (const previous of graph.get(key)) visit(previous);
    visiting.delete(key); visited.add(key);
  }
  for (const key of actionKeys) visit(key);
  if (repeated || seen.size !== actionKeys.size) blueprintFail('invalid_dependency_groups');
}

export function validateSystemsBlueprintDefinition(input) {
  if (!exactBlueprintObject(input, ['schemaVersion', 'compilerVersion', 'blueprintKey', 'components', 'milestones', 'actions', 'deliverables', 'dependencyGroups'])) blueprintFail();
  if (input.schemaVersion !== SYSTEMS_BLUEPRINT_SCHEMA_VERSION) blueprintFail('unsupported_definition_version');
  if (input.compilerVersion !== SYSTEMS_BLUEPRINT_COMPILER_VERSION) blueprintFail('unsupported_compiler_version');
  if (!keyValid(input.blueprintKey)) blueprintFail();
  for (const kind of ['components', 'milestones', 'actions', 'deliverables', 'dependencyGroups']) {
    if (!blueprintArray(input[kind], SYSTEMS_BLUEPRINT_LIMITS[kind], kind === 'deliverables' ? 0 : 1)) blueprintFail();
  }
  // Entity keys are unique across all three kinds, not just within one table.
  const entityKeys = new Set();
  const entities = (kind, label, positioned = false) => input[kind].map(row => {
    if (!exactBlueprintObject(row, ['logicalKey', label, ...(positioned ? ['position'] : [])])
      || !keyValid(row.logicalKey) || !titleValid(row[label]) || (positioned && !positionValid(row.position))) blueprintFail();
    if (entityKeys.has(row.logicalKey)) blueprintFail('duplicate_logical_key');
    entityKeys.add(row.logicalKey);
    return { logicalKey: row.logicalKey, [label]: row[label].trim(), ...(positioned ? { position: row.position } : {}) };
  });
  const milestones = entities('milestones', 'name', true).sort(byPosition);
  const actions = entities('actions', 'title').sort((a, b) => compareKeys(a.logicalKey, b.logicalKey));
  const deliverables = entities('deliverables', 'title').sort((a, b) => compareKeys(a.logicalKey, b.logicalKey));
  const milestoneKeys = new Set(milestones.map(row => row.logicalKey));
  const actionKeys = new Set(actions.map(row => row.logicalKey));
  const deliverableKeys = new Set(deliverables.map(row => row.logicalKey));
  const componentKeys = new Set(), usedMilestones = new Set(), usedActions = new Set(), usedDeliverables = new Set();
  const components = input.components.map(row => {
    if (!exactBlueprintObject(row, ['logicalKey', 'position', 'milestoneKey', 'actionKey', 'deliverableKey'])
      || !keyValid(row.logicalKey) || !positionValid(row.position)
      || !keyValid(row.milestoneKey) || !keyValid(row.actionKey)
      || (row.deliverableKey !== null && !keyValid(row.deliverableKey))) blueprintFail();
    if (componentKeys.has(row.logicalKey) || entityKeys.has(row.logicalKey)) blueprintFail('duplicate_logical_key');
    componentKeys.add(row.logicalKey);
    if (!milestoneKeys.has(row.milestoneKey) || !actionKeys.has(row.actionKey)
      || (row.deliverableKey !== null && !deliverableKeys.has(row.deliverableKey))) blueprintFail('dangling_reference');
    // Only Milestones may be shared (Email/SMS); work/output is component-owned.
    if (usedActions.has(row.actionKey) || (row.deliverableKey !== null && usedDeliverables.has(row.deliverableKey))) blueprintFail('invalid_definition');
    usedMilestones.add(row.milestoneKey); usedActions.add(row.actionKey);
    if (row.deliverableKey !== null) usedDeliverables.add(row.deliverableKey);
    return { logicalKey: row.logicalKey, position: row.position, milestoneKey: row.milestoneKey, actionKey: row.actionKey, deliverableKey: row.deliverableKey };
  }).sort(byPosition);
  if (usedMilestones.size !== milestoneKeys.size || usedActions.size !== actionKeys.size || usedDeliverables.size !== deliverableKeys.size) blueprintFail('dangling_reference');
  const dependencyGroups = input.dependencyGroups.map(group => {
    if (!blueprintArray(group, SYSTEMS_BLUEPRINT_LIMITS.actions, 1) || !group.every(keyValid)) blueprintFail();
    return [...group].sort(compareKeys);
  });
  // Check all references before constructing graph edges.
  if (dependencyGroups.some(group => group.some(key => !actionKeys.has(key)))) blueprintFail('dangling_reference');
  validateGroups(dependencyGroups, actionKeys);
  const definition = { schemaVersion: input.schemaVersion, compilerVersion: input.compilerVersion,
    blueprintKey: input.blueprintKey, components, milestones, actions, deliverables, dependencyGroups };
  if (blueprintByteLength(definition) > SYSTEMS_BLUEPRINT_LIMITS.definitionBytes) blueprintFail('definition_too_large');
  return definition;
}

export async function encodeSystemsBlueprintDefinition(input) {
  const definition = validateSystemsBlueprintDefinition(input);
  const definitionJson = canonicalJson(definition);
  return { definition, definitionJson, definitionHash: await hashDefinitionJson(definitionJson) };
}
