// The versioned blueprint language. No runtime progress or identity fields.
import { RESPONSIBLE_PARTIES, VISIBILITIES } from './schema.mjs';

export const ONBOARDING_CATEGORIES = Object.freeze(['common', 'social', 'ads', 'ghl', 'kajabi']);
export const SERVICE_TEMPLATE_MAP = Object.freeze({
  'social-media-management': 'social', ads: 'ads', ghl: 'ghl', kajabi: 'kajabi',
});
export class OnboardingError extends Error {
  constructor(reason, message = 'The onboarding definition could not be used.') {
    super(message);
    this.name = 'OnboardingError';
    this.reason = reason;
  }
}
const invalid = () => { throw new OnboardingError('invalid_definition'); };
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const only = (value, keys) => object(value) && Object.keys(value).every((key) => keys.includes(key));
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
export const compareKeys = (a, b) => a < b ? -1 : a > b ? 1 : 0;

export function validateOnboardingDefinition(input) {
  if (!only(input, ['schemaVersion', 'category', 'items']) || input.schemaVersion !== 1 ||
      !ONBOARDING_CATEGORIES.includes(input.category) || !Array.isArray(input.items) || input.items.length > 100) invalid();
  const keys = new Set();
  const items = input.items.map((item) => {
    if (!only(item, ['logicalKey', 'title', 'instructions', 'required', 'verificationRequired', 'responsibleParty', 'visibility', 'position']) ||
        typeof item.logicalKey !== 'string' || !/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(item.logicalKey) || item.logicalKey.length > 64 ||
        keys.has(item.logicalKey) || !text(item.title, 200) ||
        (item.instructions != null && (typeof item.instructions !== 'string' || item.instructions.length > 10000)) ||
        typeof item.required !== 'boolean' || typeof item.verificationRequired !== 'boolean' ||
        !RESPONSIBLE_PARTIES.includes(item.responsibleParty) || !VISIBILITIES.includes(item.visibility) ||
        !Number.isSafeInteger(item.position) || Math.abs(item.position) > 2147483647) invalid();
    keys.add(item.logicalKey);
    return {
      logicalKey: item.logicalKey, title: item.title.trim(), instructions: item.instructions?.trim() || null,
      required: item.required, verificationRequired: item.verificationRequired,
      responsibleParty: item.responsibleParty, visibility: item.visibility, position: item.position,
    };
  });
  items.sort((a, b) => a.position - b.position || compareKeys(a.logicalKey, b.logicalKey));
  return { schemaVersion: 1, category: input.category, items };
}

// Object property order and input item order do not affect the encoded
// definition. Position and logical key define the semantic item order.
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort(compareKeys).map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export async function hashDefinitionJson(definitionJson) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(definitionJson));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export async function encodeOnboardingDefinition(input) {
  const definition = validateOnboardingDefinition(input);
  const definitionJson = canonicalJson(definition);
  return { definition, definitionJson, definitionHash: await hashDefinitionJson(definitionJson) };
}
