import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GHL_BUILD_BLUEPRINT_V1 as source } from '../lib/bloomops/systems-blueprint-defaults.mjs';
import { compileSystemsBlueprint, SYSTEMS_BLUEPRINT_INITIAL } from '../lib/bloomops/systems-blueprint-compiler.mjs';
import { blueprintByteLength, encodeSystemsBlueprintDefinition, SYSTEMS_BLUEPRINT_LIMITS as limits,
  SystemsBlueprintError, validateSystemsBlueprintDefinition } from '../lib/bloomops/systems-blueprint-definition.mjs';
import { canonicalJson } from '../lib/bloomops/onboarding-definition.mjs';
import { MILESTONE_STATUSES } from '../lib/bloomops/milestone-values.mjs';
import { ACTION_STATUSES, ACTION_PRIORITIES } from '../lib/bloomops/action-values.mjs';
import { DELIVERABLE_STATUSES } from '../lib/bloomops/deliverable-values.mjs';
import { VISIBILITIES } from '../lib/bloomops/schema.mjs';
import { GOLDEN_PLANS, INVALID_DEFINITIONS } from './fixtures/systems-blueprint-golden.mjs';

const definition = () => structuredClone(source);
const compile = (selectedComponentKeys = ['funnel'], d = source) => compileSystemsBlueprint({ definition: d, selectedComponentKeys });
const allKeys = GOLDEN_PLANS.find(row => row.name === 'all').selection;
const rejects = (fn, reason) => assert.throws(fn, error => error instanceof SystemsBlueprintError && error.reason === reason);
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

for (const fixture of GOLDEN_PLANS) test(`golden plan: ${fixture.name}`, () => {
  assert.deepEqual(compile(fixture.selection), fixture.plan);
  assert.equal(canonicalJson(compile([...fixture.selection].reverse())), canonicalJson(fixture.plan));
});
for (const fixture of INVALID_DEFINITIONS) test(`golden invalid definition: ${fixture.name}`, () => {
  rejects(() => validateSystemsBlueprintDefinition(fixture.definition), fixture.reason);
  rejects(() => compile(['funnel'], fixture.definition), fixture.reason);
});
for (const key of allKeys) test(`only ${key} generates its canonical component (nothing unselected)`, () => {
  const plan = compile([key]);
  const component = source.components.find(row => row.logicalKey === key);
  assert.deepEqual(plan.selectedComponentKeys, [key]);
  assert.deepEqual(plan.milestones.map(row => row.logicalKey), [component.milestoneKey]);
  assert.deepEqual(plan.actions.map(row => row.logicalKey), [component.actionKey]);
  assert.deepEqual(plan.deliverables.map(row => row.logicalKey), component.deliverableKey ? [component.deliverableKey] : []);
  assert.deepEqual(plan.dependencies, []);
});
test('immutable defaults and frozen inputs are untouched; results share no mutable input state', async () => {
  const d = freeze(definition()), selection = freeze(['sms', 'access', 'email']);
  const before = canonicalJson({ d, selection });
  const normalized = validateSystemsBlueprintDefinition(d);
  const result = compile(selection, d);
  await encodeSystemsBlueprintDefinition(d);
  normalized.actions[0].title = 'Changed'; result.actions[0].title = 'Changed'; result.selectedComponentKeys.pop();
  assert.equal(canonicalJson({ d, selection }), before);
  assert.ok(Object.isFrozen(source)); assert.ok(Object.isFrozen(source.components[0]));
  assert.ok(Object.isFrozen(source.dependencyGroups[2])); assert.ok(Object.isFrozen(SYSTEMS_BLUEPRINT_INITIAL));
});
test('definition normalization/hash and plans ignore property, catalogue and parallel-group member order', async () => {
  const d = definition();
  for (const field of ['components', 'milestones', 'actions', 'deliverables']) {
    d[field].reverse(); d[field] = d[field].map(row => Object.fromEntries(Object.entries(row).reverse()));
  }
  d.dependencyGroups.forEach(group => group.reverse());
  d.actions[0].title = `  ${d.actions[0].title}  `;
  const reversed = Object.fromEntries(Object.entries(d).reverse());
  assert.deepEqual(await encodeSystemsBlueprintDefinition(reversed), await encodeSystemsBlueprintDefinition(source));
  assert.deepEqual(compile([...allKeys].reverse(), reversed), compile(allKeys));
  const encoded = await encodeSystemsBlueprintDefinition(source);
  assert.match(encoded.definitionHash, /^[0-9a-f]{64}$/);
});
test('labels are never identity and changed labels change definition hash, not logical graph', async () => {
  const d = definition();
  d.actions.forEach(row => { row.title = 'Same visible title'; });
  d.milestones.forEach(row => { row.name = 'Same phase'; });
  d.deliverables.forEach(row => { row.title = 'Same output'; });
  const old = compile(allKeys), next = compile(allKeys, d);
  for (const field of ['milestones', 'actions', 'deliverables']) assert.deepEqual(next[field].map(row => row.logicalKey), old[field].map(row => row.logicalKey));
  assert.deepEqual(next.dependencies, old.dependencies);
  assert.notEqual((await encodeSystemsBlueprintDefinition(d)).definitionHash, (await encodeSystemsBlueprintDefinition(source)).definitionHash);
});
test('equal positions use logical-key tie breaks, never labels or input order', () => {
  const d = definition();
  d.components.forEach(row => { row.position = 0; }); d.milestones.forEach(row => { row.position = 0; });
  const plan = compile(allKeys, d);
  assert.deepEqual(plan.selectedComponentKeys, [...allKeys].sort());
  assert.deepEqual(plan.milestones.map(row => row.logicalKey), plan.milestones.map(row => row.logicalKey).sort());
  assert.deepEqual(plan.milestones.map(row => row.position), Array.from({ length: 13 }, (_, i) => (i + 1) * 10));
});
test('initial values are exactly canonical, internal and non-executing', () => {
  const plan = compile(allKeys);
  for (const [rows, statuses, expected] of [[plan.milestones, MILESTONE_STATUSES, 'upcoming'], [plan.actions, ACTION_STATUSES, 'to_do'], [plan.deliverables, DELIVERABLE_STATUSES, 'planned']]) {
    assert.ok(statuses.includes(expected));
    for (const row of rows) { assert.equal(row.status, expected); assert.equal(row.visibility, 'internal'); }
  }
  assert.ok(VISIBILITIES.includes('internal')); assert.ok(ACTION_PRIORITIES.includes('normal'));
  assert.deepEqual(Object.keys(plan), ['schemaVersion', 'compilerVersion', 'blueprintKey', 'selectedComponentKeys', 'milestones', 'actions', 'deliverables', 'dependencies']);
  assert.doesNotMatch(JSON.stringify(plan), /workspaceId|projectId|membershipId|assignee|dueDate|createdAt|requestId|authorized|credentials|providerExecution/);
});
test('bridge omitted phases but keep selected build work parallel', () => {
  const plan = compile(['discovery', 'funnel', 'forms', 'handoff']);
  assert.deepEqual(plan.dependencies, [
    { actionKey: 'ghl_forms_build', dependsOnActionKey: 'ghl_discovery_confirm_scope' },
    { actionKey: 'ghl_funnel_build', dependsOnActionKey: 'ghl_discovery_confirm_scope' },
    { actionKey: 'ghl_handoff_prepare', dependsOnActionKey: 'ghl_forms_build' },
    { actionKey: 'ghl_handoff_prepare', dependsOnActionKey: 'ghl_funnel_build' },
  ]);
});
const forbidden = ['workspaceId', 'projectId', 'clientId', 'serviceType', 'membershipId', 'actor', 'authorization',
  'credentials', 'password', 'apiKey', 'providerExecution', 'status', 'visibility', 'requestId'];
for (const field of forbidden) test(`no authority/execution/runtime input: ${field}`, () => {
  rejects(() => compileSystemsBlueprint({ definition: source, selectedComponentKeys: ['funnel'], [field]: 'forbidden' }), 'invalid_input');
  for (const path of [null, 'components', 'milestones', 'actions', 'deliverables']) {
    const d = definition(); (path ? d[path][0] : d)[field] = 'forbidden';
    rejects(() => compile(['funnel'], d), 'invalid_definition');
  }
});
const malformed = {
  'missing root field': d => { delete d.actions; },
  'missing nullable component reference': d => { delete d.components[0].deliverableKey; },
  'empty title': d => { d.actions[0].title = ' '; },
  'long title': d => { d.actions[0].title = 'x'.repeat(121); },
  'control in title': d => { d.actions[0].title = 'Secret\nvalue'; },
  'non-string title': d => { d.actions[0].title = {}; },
  'uppercase key': d => { d.actions[0].logicalKey = 'GHL'; },
  'long key': d => { d.actions[0].logicalKey = 'a'.repeat(65); },
  'punctuation key': d => { d.actions[0].logicalKey = 'a.b'; },
  'negative position': d => { d.components[0].position = -1; },
  'fractional position': d => { d.components[0].position = 1.5; },
  'oversized position': d => { d.milestones[0].position = 2147483648; },
  'NaN position': d => { d.milestones[0].position = NaN; },
  'string position': d => { d.milestones[0].position = '1'; },
  'empty group': d => { d.dependencyGroups[0] = []; },
  'sparse group': d => { d.dependencyGroups[0] = Array(1); },
  'sparse catalogue': d => { delete d.actions[0]; },
  'array properties': d => { d.actions.secret = true; },
  'symbol field': d => { d[Symbol('secret')] = true; },
  'inherited fields': d => { Object.setPrototypeOf(d, { secret: true }); },
};
for (const [name, mutate] of Object.entries(malformed)) test(`malformed definition fails closed: ${name}`, () => {
  const d = definition(); mutate(d); rejects(() => compile(['funnel'], d), 'invalid_definition');
});
for (const field of ['schemaVersion', 'compilerVersion']) for (const version of [0, 2, '1', null]) test(`${field} rejects unsupported ${JSON.stringify(version)}`, () => {
  const d = definition(); d[field] = version;
  rejects(() => compile(['funnel'], d), field === 'schemaVersion' ? 'unsupported_definition_version' : 'unsupported_compiler_version');
});
for (const field of ['components', 'milestones', 'actions', 'deliverables']) test(`duplicate ${field} logical keys fail, including unselected work`, () => {
  const d = definition(); d[field][1].logicalKey = d[field][0].logicalKey;
  rejects(() => compile(['funnel'], d), 'duplicate_logical_key');
});
test('cross-kind entity key collision fails', () => {
  const d = definition(); d.actions[0].logicalKey = d.milestones[0].logicalKey;
  rejects(() => compile(['funnel'], d), 'duplicate_logical_key');
});
for (const field of ['milestoneKey', 'actionKey', 'deliverableKey']) test(`dangling ${field} fails before selection`, () => {
  const d = definition(); d.components[0][field] = 'missing'; rejects(() => compile(['funnel'], d), 'dangling_reference');
});
test('orphan definitions, duplicate component ownership and incomplete group coverage fail', () => {
  let d = definition(); d.components.splice(0, 1); rejects(() => compile(['funnel'], d), 'dangling_reference');
  d = definition(); d.components[1].actionKey = d.components[0].actionKey; rejects(() => compile(['funnel'], d), 'invalid_definition');
  d = definition(); d.components[3].deliverableKey = d.components[2].deliverableKey; rejects(() => compile(['funnel'], d), 'invalid_definition');
  d = definition(); d.dependencyGroups.pop(); rejects(() => compile(['funnel'], d), 'invalid_dependency_groups');
});
test('multi-node cycles and repeated parallel-group membership fail even if unselected', () => {
  let d = definition(); d.dependencyGroups.push(['ghl_discovery_confirm_scope']);
  rejects(() => compile(['funnel'], d), 'cyclic_dependencies');
  d = definition(); d.dependencyGroups[2].push('ghl_funnel_build');
  rejects(() => compile(['access'], d), 'invalid_dependency_groups');
});
for (const selection of [[], ['unknown'], ['Funnel'], ['constructor'], ['funnel', 'funnel'], ['funnel', null], 'funnel', {}, null, Array(1), Array(15).fill('funnel')]) test(`invalid selection: ${JSON.stringify(selection)}`, () => {
  rejects(() => compile(selection), 'invalid_selection');
});
test('getters are refused without execution', () => {
  let called = false;
  const d = definition(); Object.defineProperty(d.actions[0], 'title', { enumerable: true, get() { called = true; return 'x'; } });
  rejects(() => compile(['funnel'], d), 'invalid_definition'); assert.equal(called, false);
  const selection = ['funnel']; Object.defineProperty(selection, '0', { enumerable: true, get() { called = true; return 'funnel'; } });
  rejects(() => compile(selection), 'invalid_selection'); assert.equal(called, false);
});
const sanitizedFailure = (reason, sentinel) => error => {
  assert.ok(error instanceof SystemsBlueprintError);
  assert.equal(error.reason, reason);
  assert.equal(error.message, 'The Systems blueprint could not be compiled.');
  assert.doesNotMatch(error.stack, new RegExp(sentinel));
  assert.equal(error.cause, undefined);
  return true;
};
for (const trap of ['getPrototypeOf', 'ownKeys', 'getOwnPropertyDescriptor']) test(`sanitize exotic ${trap} reflection failures`, () => {
  const sentinel = 'private_reflection_sentinel';
  const wrap = value => new Proxy(value, { [trap]() { throw new Error(sentinel); } });
  assert.throws(() => validateSystemsBlueprintDefinition(wrap(source)), sanitizedFailure('invalid_definition', sentinel));
  assert.throws(() => compileSystemsBlueprint(wrap({ definition: source, selectedComponentKeys: ['funnel'] })), sanitizedFailure('invalid_input', sentinel));
  const d = definition(); d.actions[0] = wrap(d.actions[0]);
  assert.throws(() => compile(['funnel'], d), sanitizedFailure('invalid_definition', sentinel));
  assert.throws(() => compile(wrap(['funnel'])), sanitizedFailure('invalid_selection', sentinel));
});
test('revoked proxies and exotic array length failures are sanitized', () => {
  for (const target of [{}, []]) {
    const { proxy, revoke } = Proxy.revocable(target, {}); revoke();
    assert.throws(() => validateSystemsBlueprintDefinition(proxy), sanitizedFailure('invalid_definition', 'private_sentinel'));
    assert.throws(() => compile(proxy), sanitizedFailure('invalid_selection', 'private_sentinel'));
  }
  const selection = new Proxy(['funnel'], { get(target, key) {
    if (key === 'length') throw new Error('private_length_sentinel');
    return Reflect.get(target, key);
  } });
  assert.throws(() => compile(selection), sanitizedFailure('invalid_selection', 'private_length_sentinel'));
});
test('reflection cleanup does not swallow unrelated encoding failures', async () => {
  const originalDigest = crypto.subtle.digest;
  const sentinel = new Error('unexpected encoding failure');
  try {
    crypto.subtle.digest = () => { throw sentinel; };
    await assert.rejects(encodeSystemsBlueprintDefinition(source), error => error === sentinel);
  } finally { crypto.subtle.digest = originalDigest; }
});
for (const separator of ['\u0085', '\u2028', '\u2029']) test(`single-line labels reject U+${separator.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`, () => {
  for (const kind of ['milestones', 'actions', 'deliverables']) {
    const d = definition(); d[kind][0][kind === 'milestones' ? 'name' : 'title'] = `First${separator}Second`;
    rejects(() => compile(['funnel'], d), 'invalid_definition');
  }
});

// Deterministic synthetic size fixtures. JSON escapes lone surrogate code units
// as six ASCII bytes each; they are valid under the existing UTF-16 title policy.
// Nothing here changes the default manifest or any production bound.
function byteLimitFixture(labelLength) {
  const d = definition();
  const keys = new Map([...d.components, ...d.milestones, ...d.actions, ...d.deliverables]
    .map(row => [row.logicalKey, row.logicalKey.padEnd(64, 'x')]));
  d.blueprintKey = d.blueprintKey.padEnd(64, 'x');
  for (const row of d.components) {
    for (const field of ['logicalKey', 'milestoneKey', 'actionKey', 'deliverableKey']) {
      if (row[field] !== null) row[field] = keys.get(row[field]);
    }
  }
  for (const kind of ['milestones', 'actions', 'deliverables']) for (const row of d[kind]) {
    row.logicalKey = keys.get(row.logicalKey);
    row[kind === 'milestones' ? 'name' : 'title'] = '\ud800'.repeat(labelLength);
  }
  const actionKeys = d.actions.map(row => row.logicalKey);
  d.dependencyGroups = [actionKeys.slice(0, 7), actionKeys.slice(7)];
  return d;
}
test('oversized normalized definition returns sanitized definition_too_large', async () => {
  const d = byteLimitFixture(120);
  // This fixture is already label-normalized; sorting cannot change its byte size.
  assert.equal(blueprintByteLength(d), 34178);
  assert.ok(blueprintByteLength(d) > limits.definitionBytes);
  assert.throws(() => validateSystemsBlueprintDefinition(d), sanitizedFailure('definition_too_large', 'private_sentinel'));
  assert.throws(() => compile([d.components[0].logicalKey], d), sanitizedFailure('definition_too_large', 'private_sentinel'));
  await assert.rejects(encodeSystemsBlueprintDefinition(d), sanitizedFailure('definition_too_large', 'private_sentinel'));
});
test('valid bounded definition can reject an oversized compiled plan', () => {
  const d = byteLimitFixture(105);
  const normalized = validateSystemsBlueprintDefinition(d);
  assert.equal(blueprintByteLength(normalized), 31028);
  assert.ok(blueprintByteLength(normalized) <= limits.definitionBytes);
  assert.ok(blueprintByteLength(compile([d.components[0].logicalKey], d)) <= limits.planBytes);
  assert.throws(() => compile(d.components.map(row => row.logicalKey), d), sanitizedFailure('plan_too_large', 'private_sentinel'));
});
test('size limits are explicit; exact maximum catalogue is valid, oversized arrays fail', () => {
  const plan = compile(allKeys);
  assert.deepEqual([plan.milestones.length, plan.actions.length, plan.deliverables.length, plan.dependencies.length], [13, 14, 8, 20]);
  assert.equal(plan.milestones.length + plan.actions.length + plan.deliverables.length, limits.planRecords);
  assert.ok(blueprintByteLength(source) <= limits.definitionBytes); assert.ok(blueprintByteLength(plan) <= limits.planBytes);
  for (const kind of ['components', 'milestones', 'actions', 'deliverables', 'dependencyGroups']) {
    const d = definition(); d[kind] = Array(limits[kind] + 1).fill(d[kind][0]);
    rejects(() => compile(['funnel'], d), 'invalid_definition');
  }
});
test('49-edge bound is attainable without cycles: two parallel groups of seven', () => {
  const d = definition(); const keys = d.actions.map(row => row.logicalKey);
  d.dependencyGroups = [keys.slice(0, 7), keys.slice(7)];
  assert.equal(compile(allKeys, d).dependencies.length, limits.dependencies);
});
test('all 16,383 nonempty selections have exact membership, bounded acyclic edges and deterministic results', () => {
  const rank = new Map(source.dependencyGroups.flatMap((group, index) => group.map(key => [key, index])));
  for (let mask = 1; mask < 2 ** allKeys.length; mask++) {
    const selection = allKeys.filter((_, index) => mask & (1 << index));
    const plan = compile(selection);
    assert.deepEqual(plan, compile([...selection].reverse()));
    assert.equal(plan.actions.length, selection.length);
    assert.equal(plan.milestones.length, selection.length - Number(selection.includes('email') && selection.includes('sms')));
    assert.equal(plan.deliverables.length, selection.filter(key => ['funnel', 'forms', 'calendar', 'pipeline', 'automations', 'email', 'sms', 'integrations'].includes(key)).length);
    const ids = new Set(plan.actions.map(row => row.logicalKey));
    const pairs = new Set();
    for (const edge of plan.dependencies) {
      assert.ok(ids.has(edge.actionKey) && ids.has(edge.dependsOnActionKey));
      assert.ok(rank.get(edge.dependsOnActionKey) < rank.get(edge.actionKey), 'strictly increasing group rank proves acyclicity');
      const pair = `${edge.actionKey}:${edge.dependsOnActionKey}`;
      assert.ok(!pairs.has(pair)); pairs.add(pair);
    }
    for (const row of plan.actions) {
      const earlier = plan.actions.filter(other => rank.get(other.logicalKey) < rank.get(row.logicalKey));
      const nearestRank = Math.max(-1, ...earlier.map(other => rank.get(other.logicalKey)));
      assert.deepEqual(plan.dependencies.filter(edge => edge.actionKey === row.logicalKey).map(edge => edge.dependsOnActionKey).sort(),
        earlier.filter(other => rank.get(other.logicalKey) === nearestRank).map(other => other.logicalKey).sort());
    }
    assert.ok(plan.dependencies.length <= limits.dependencies);
    assert.ok(blueprintByteLength(plan) <= limits.planBytes);
  }
});
test('malformed caller shapes and non-data properties never become accepted compiler inputs', () => {
  for (const value of [undefined, null, true, 1, 'input', [], {}, { definition: source }, { selectedComponentKeys: ['funnel'] }]) {
    rejects(() => compileSystemsBlueprint(value), 'invalid_input');
  }
  const input = { definition: source, selectedComponentKeys: ['funnel'] };
  Object.defineProperty(input, 'authorization', { value: true, enumerable: false });
  rejects(() => compileSystemsBlueprint(input), 'invalid_input');
  let called = false;
  Object.defineProperty(input, 'definition', { enumerable: true, get() { called = true; return source; } });
  rejects(() => compileSystemsBlueprint(input), 'invalid_input'); assert.equal(called, false);
});
test('UTF-8 byte accounting is explicit and errors do not echo private input', () => {
  assert.equal(blueprintByteLength('é'), 4);
  assert.equal(blueprintByteLength('😀'), 6);
  const d = definition(); d.actions[0].password = 'private-input-sentinel';
  assert.throws(() => compile(['funnel'], d), error => {
    assert.equal(error.reason, 'invalid_definition'); assert.doesNotMatch(error.message, /private-input-sentinel/); return true;
  });
});
