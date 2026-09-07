import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ONBOARDING_TEMPLATES } from '../lib/bloomops/onboarding-defaults.mjs';
import { canonicalJson, encodeOnboardingDefinition, validateOnboardingDefinition } from '../lib/bloomops/onboarding-definition.mjs';
import { compileOnboardingPlan } from '../lib/bloomops/onboarding-compiler.mjs';

const definition = () => JSON.parse(DEFAULT_ONBOARDING_TEMPLATES[1].definitionJson);
const invalidCases = {
  'schema version': (d) => { d.schemaVersion = 2; },
  'category': (d) => { d.category = 'systems'; },
  'items array': (d) => { d.items = {}; },
  'duplicate key': (d) => { d.items.push({ ...d.items[0] }); },
  'uppercase key': (d) => { d.items[0].logicalKey = 'Instagram'; },
  'punctuated key': (d) => { d.items[0].logicalKey = 'instagram.access'; },
  'empty key': (d) => { d.items[0].logicalKey = ''; },
  'empty title': (d) => { d.items[0].title = ' '; },
  'long title': (d) => { d.items[0].title = 'x'.repeat(201); },
  'long instructions': (d) => { d.items[0].instructions = 'x'.repeat(10001); },
  'non-text instructions': (d) => { d.items[0].instructions = 1; },
  'responsible party': (d) => { d.items[0].responsibleParty = 'admin'; },
  'visibility': (d) => { d.items[0].visibility = 'public'; },
  'required boolean': (d) => { d.items[0].required = 1; },
  'verification boolean': (d) => { d.items[0].verificationRequired = 'false'; },
  'fractional position': (d) => { d.items[0].position = 0.5; },
  'missing position': (d) => { delete d.items[0].position; },
  'oversized position': (d) => { d.items[0].position = 2 ** 32; },
  'runtime status': (d) => { d.items[0].status = 'completed'; },
  'runtime completion': (d) => { d.items[0].completedAt = '2026-09-07'; },
  'unknown root field': (d) => { d.clientId = 'client'; },
};
for (const [name, mutate] of Object.entries(invalidCases)) test(`definition rejects ${name}`, () => {
  const d = definition(); mutate(d);
  assert.throws(() => validateOnboardingDefinition(d), { reason: 'invalid_definition' });
});
test('canonical serialization ignores property/item order, normalizes optional instructions, and preserves positions', async () => {
  const a = definition(); a.items[0].instructions = null;
  const b = Object.fromEntries(Object.entries(a).reverse());
  b.items = a.items.map((i) => Object.fromEntries(Object.entries(i).reverse())).reverse();
  delete b.items[1].instructions;
  assert.deepEqual(await encodeOnboardingDefinition(a), await encodeOnboardingDefinition(b));
  assert.equal(validateOnboardingDefinition(a).items[0].position, 10);
});
const services = (slugs) => slugs.map((serviceTypeSlug, i) => ({ id: `s${i}`, workspaceId: 'a', clientId: 'c', serviceTypeSlug }));
const snapshots = () => DEFAULT_ONBOARDING_TEMPLATES.map((t) => ({ ...t, id: t.slug, workspaceId: 'a', status: 'published' }));
const compile = (source = snapshots(), slugs = ['social-media-management', 'ads']) => compileOnboardingPlan({ workspaceId: 'a', clientId: 'c', services: services(slugs), snapshots: source });
function change(source, category, key, fields) {
  const row = source.find((s) => s.slug === category);
  const d = JSON.parse(row.definitionJson);
  Object.assign(d.items.find((i) => i.logicalKey === key), fields);
  row.definitionJson = canonicalJson(d);
}
test('Social + Ads dedupes Meta by key and preserves all five separate requirements and links', () => {
  const plan = compile();
  assert.deepEqual(plan.sourceTemplateVersions, ['common', 'social', 'ads']);
  assert.deepEqual(plan.items.map((i) => i.logicalKey), ['agreement', 'brand_assets', 'kickoff_booking', 'instagram_access', 'meta_business_access']);
  assert.deepEqual(plan.items.map((i) => i.serviceEngagementIds), [[], [], [], ['s0'], ['s0', 's1']]);
});
test('compiler selects Common Social Ads GHL, but not Kajabi', () => {
  const plan = compile(snapshots(), ['social-media-management', 'ads', 'ghl']);
  assert.deepEqual(plan.sourceTemplateVersions, ['common', 'social', 'ads', 'ghl']);
  assert.deepEqual(plan.items.at(-1).serviceEngagementIds, ['s2']);
});
test('Content Calendar and unknown services get Common only; no department-based selection', () => {
  assert.deepEqual(compile(snapshots(), ['content-calendar', 'unknown', 'constructor']).sourceTemplateVersions, ['common']);
});
test('Common alone is generated when no service is selected', () => {
  assert.equal(compile(snapshots(), []).items.length, 3);
});
test('visible label differences do not duplicate a logical key; category precedence chooses Social title', () => {
  const source = snapshots(); change(source, 'ads', 'meta_business_access', { title: 'Different Meta label' });
  const meta = compile(source).items.filter((i) => i.logicalKey === 'meta_business_access');
  assert.equal(meta.length, 1); assert.equal(meta[0].title, 'Meta Business access');
});
for (const flag of ['required', 'verificationRequired']) test(`${flag} merges with OR in either source order`, () => {
  for (const category of ['social', 'ads']) {
    const source = snapshots(); change(source, category, 'meta_business_access', { [flag]: false });
    assert.equal(compile(source).items.at(-1)[flag], true);
  }
  const source = snapshots();
  for (const category of ['social', 'ads']) change(source, category, 'meta_business_access', { [flag]: false });
  assert.equal(compile(source).items.at(-1)[flag], false);
});
for (const [field, value] of [['responsibleParty', 'team'], ['visibility', 'internal'], ['instructions', 'Conflicting meaningful access request']]) test(`merge rejects conflicting ${field}`, () => {
  const source = snapshots(); change(source, 'ads', 'meta_business_access', { [field]: value });
  assert.throws(() => compile(source), { reason: 'definition_conflict' });
});
test('one meaningful instruction survives an empty one and equal instructions are retained', () => {
  const source = snapshots(); change(source, 'social', 'meta_business_access', { instructions: '  ' });
  assert.equal(compile(source).items.at(-1).instructions, compile().items.at(-1).instructions);
});
test('optional course videos and all canonical responsible parties survive compilation', () => {
  assert.equal(compile(snapshots(), ['kajabi']).items.find((i) => i.logicalKey === 'course_videos').required, false);
  for (const responsibleParty of ['client', 'team', 'user', 'external']) {
    const source = snapshots(); change(source, 'ghl', 'ghl_access', { responsibleParty });
    assert.equal(compile(source, ['ghl']).items.at(-1).responsibleParty, responsibleParty);
  }
});
test('ordering and deduplication are independent of DB order and input arrays stay untouched', () => {
  const source = snapshots(); const selected = services(['ads', 'social-media-management', 'social-media-management']);
  const before = canonicalJson({ source, selected });
  const a = compileOnboardingPlan({ workspaceId: 'a', clientId: 'c', snapshots: source, services: selected });
  const b = compileOnboardingPlan({ workspaceId: 'a', clientId: 'c', snapshots: [...source].reverse(), services: [...selected].reverse() });
  assert.deepEqual(a, b); assert.equal(canonicalJson({ source, selected }), before);
  assert.deepEqual(a.items.at(-1).serviceEngagementIds, ['s0', 's1', 's2']);
});
test('same source positions have a stable logical-key tiebreaker', () => {
  const source = snapshots();
  change(source, 'common', 'kickoff_booking', { position: 10 });
  change(source, 'common', 'brand_assets', { position: 10 });
  assert.deepEqual(compile(source).items.slice(0, 3).map((i) => i.logicalKey), ['agreement', 'brand_assets', 'kickoff_booking']);
});
test('missing, draft, duplicate, or foreign required sources fail compilation', () => {
  assert.throws(() => compile(snapshots().filter((s) => s.slug !== 'ads')), { reason: 'missing_published_template' });
  for (const [field, value, reason] of [['status', 'draft', 'missing_published_template'], ['workspaceId', 'b', 'not_found']]) {
    const source = snapshots(); source[2][field] = value;
    assert.throws(() => compile(source), { reason });
  }
  const source = snapshots(); source.push(source[2]);
  assert.throws(() => compile(source), { reason: 'definition_conflict' });
});
test('foreign workspace or client service is rejected by the pure compiler', () => {
  for (const field of ['workspaceId', 'clientId']) {
    const selected = services(['ads']); selected[0][field] = 'foreign';
    assert.throws(() => compileOnboardingPlan({ workspaceId: 'a', clientId: 'c', snapshots: snapshots(), services: selected }), { reason: 'not_found' });
  }
});
