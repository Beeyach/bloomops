// Explicit runtime choices. A link is an external destination, never evidence
// that a file was received, an agreement was signed or an appointment booked.
export const ONBOARDING_ACTIONS = {
  confirmation: { label: 'Confirmation only', icon: 'check' },
  agreement: { label: 'Open agreement', icon: 'pages' },
  upload: { label: 'Open upload folder', icon: 'upload' },
  booking: { label: 'Book kickoff', icon: 'calendar' },
  access: { label: 'Set up access', icon: 'settings' },
  link: { label: 'Open instructions', icon: 'external-link' },
};
const controls = /[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/u;
export function safeOnboardingUrl(input) {
  if (typeof input !== 'string' || input.length > 2048 || controls.test(input) || /[\\\s]/u.test(input)) return null;
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        !url.hostname.includes('.') || url.hostname.endsWith('.') ||
        /^(?:\d+\.){3}\d+$/.test(url.hostname) || url.hostname.includes(':') ||
        /(?:^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}
export function validateOnboardingGuidance(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(k => !['instructions','actionType','actionUrl','revision'].includes(k)) ||
      !Number.isSafeInteger(input.revision) || input.revision < 0 || input.revision >= 2147483647 ||
      !Object.hasOwn(ONBOARDING_ACTIONS, input.actionType) || typeof input.instructions !== 'string' ||
      !input.instructions.trim() || input.instructions.length > 2000 ||
      /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/u.test(input.instructions)) return null;
  const actionUrl = input.actionType === 'confirmation' ? null : safeOnboardingUrl(input.actionUrl);
  if (input.actionType === 'confirmation' ? ![null, undefined, ''].includes(input.actionUrl) : !actionUrl) return null;
  return { guidanceInstructions: input.instructions.trim(), actionType: input.actionType, actionUrl, guidanceRevision: input.revision + 1 };
}
export function guidanceReady(item) {
  return Boolean(item.guidanceInstructions?.trim() && Object.hasOwn(ONBOARDING_ACTIONS, item.actionType) &&
    (item.actionType === 'confirmation' ? !item.actionUrl : safeOnboardingUrl(item.actionUrl)));
}
