import { validateFileInput } from './file-values.mjs';

export const CONTENT_FILE_PURPOSES = ['recording', 'asset'];
export function validateContentFileInput(input, { retry = false, portal = false } = {}) {
  if (retry) return validateFileInput(input, { retry: true });
  const allowed = ['requestId', 'filename', 'mimeType', 'byteSize', 'purpose', ...portal ? [] : ['visibility']];
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !allowed.includes(key))
    || !CONTENT_FILE_PURPOSES.includes(input.purpose) || (portal && input.purpose !== 'recording')) {
    return { ok: false, reason: 'invalid', errors: { form: 'Choose an available file purpose and upload details.' } };
  }
  const { purpose, ...details } = input;
  const checked = validateFileInput({ ...details, ...portal ? { visibility: 'client' } : {} });
  if (!checked.ok) return checked;
  const { deliverableId: unused, ...value } = checked.value;
  return { ok: true, value: { ...value, purpose } };
}
