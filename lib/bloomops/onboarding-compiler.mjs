// Pure, deterministic compilation. Database ordering never decides which
// label wins, and a logical key is the only identity used for merging.
import { canonicalJson, compareKeys, OnboardingError, ONBOARDING_CATEGORIES, SERVICE_TEMPLATE_MAP, validateOnboardingDefinition } from './onboarding-definition.mjs';

export function requiredCategories(services) {
  const needed = new Set(['common']);
  for (const service of services) {
    const category = Object.hasOwn(SERVICE_TEMPLATE_MAP, service.serviceTypeSlug) ? SERVICE_TEMPLATE_MAP[service.serviceTypeSlug] : null;
    if (category) needed.add(category);
  }
  return ONBOARDING_CATEGORIES.filter((c) => needed.has(c));
}

export function compileOnboardingPlan({ workspaceId, clientId, snapshots, services }) {
  if (!workspaceId || !clientId || !Array.isArray(services) || !Array.isArray(snapshots)) throw new OnboardingError('invalid_plan');
  const serviceMap = new Map();
  for (const service of services) {
    if (!service.id || service.workspaceId !== workspaceId || service.clientId !== clientId || typeof service.serviceTypeSlug !== 'string') throw new OnboardingError('not_found');
    if (serviceMap.has(service.id) && canonicalJson(serviceMap.get(service.id)) !== canonicalJson(service)) throw new OnboardingError('invalid_plan');
    serviceMap.set(service.id, service);
  }
  const selectedServices = [...serviceMap.values()].sort((a, b) => compareKeys(a.id, b.id));
  const sourceTemplateVersions = [];
  const merged = new Map();
  for (const category of requiredCategories(selectedServices)) {
    const matches = snapshots.filter((s) => s.slug === category);
    if (!matches.length) throw new OnboardingError('missing_published_template');
    if (matches.length !== 1) throw new OnboardingError('definition_conflict');
    const source = matches[0];
    if (!source.id || source.workspaceId !== workspaceId) throw new OnboardingError('not_found');
    // Persistence also compiles historical (retired) snapshots: selection,
    // which reads the DB, owns the requirement that a source be published.
    if (!['published', 'retired'].includes(source.status)) throw new OnboardingError('missing_published_template');
    let definition;
    try { definition = validateOnboardingDefinition(JSON.parse(source.definitionJson)); } catch (e) {
      if (e instanceof SyntaxError) throw new OnboardingError('invalid_definition');
      throw e;
    }
    if (definition.category !== category) throw new OnboardingError('definition_conflict');
    sourceTemplateVersions.push(source.id);
    const links = category === 'common' ? [] : selectedServices.filter((s) => SERVICE_TEMPLATE_MAP[s.serviceTypeSlug] === category).map((s) => s.id);
    for (const item of definition.items) {
      const existing = merged.get(item.logicalKey);
      if (!existing) {
        merged.set(item.logicalKey, { ...item, serviceEngagementIds: [...links] });
        continue;
      }
      if (existing.responsibleParty !== item.responsibleParty || existing.visibility !== item.visibility ||
          (existing.instructions && item.instructions && existing.instructions !== item.instructions)) throw new OnboardingError('definition_conflict');
      existing.required ||= item.required;
      existing.verificationRequired ||= item.verificationRequired;
      existing.instructions ||= item.instructions;
      existing.serviceEngagementIds = [...new Set([...existing.serviceEngagementIds, ...links])].sort(compareKeys);
    }
  }
  return {
    workspaceId, clientId,
    selectedServiceIds: selectedServices.map((s) => s.id),
    sourceTemplateVersions,
    items: [...merged.values()].map((item, index) => ({ ...item, position: (index + 1) * 10 })),
  };
}
