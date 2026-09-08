// Deliberately small, buffered uploads on the existing Worker. No multipart
// storage protocol, public URLs, content sniffing or scanning is implied.
export const FILE_MAX_BYTES = 5 * 1024 * 1024;
export const FILE_LIMIT = 200;
export const FILE_LEASE_MS = 5 * 60 * 1000;
export const FILE_STATUSES = ['uploading', 'ready', 'failed', 'archived'];
export const FILE_STATUS_LABELS = { uploading: 'Uploading', ready: 'Ready', failed: 'Upload failed', archived: 'Archived' };
export const FILE_UPLOAD_FIELDS = ['requestId', 'filename', 'mimeType', 'byteSize', 'visibility', 'deliverableId'];
export const FILE_METADATA_HEADER = 'x-bloomops-file';

export function fileSize(bytes) {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateFileInput(input, { retry = false } = {}) {
  const errors = {};
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !(retry ? ['filename', 'mimeType', 'byteSize'] : FILE_UPLOAD_FIELDS).includes(key)))
    return { ok: false, reason: 'invalid', errors: { form: 'Use only the fields in the upload form.' } };
  // Reject path separators, C0/C1, bidi formatting and malformed UTF-16. Keep
  // the display name separate from the opaque storage key and HTTP fallback.
  const filename = typeof input.filename === 'string' ? input.filename.normalize('NFC').trim() : '';
  if (!filename || filename.length > 180 || /^[. ]+$/.test(filename) || /[\/\\\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/u.test(input.filename) || /[\uD800-\uDFFF]/u.test(filename)) errors.filename = 'Use a filename of 1–180 characters without paths or control characters.';
  const mimeType = typeof input.mimeType === 'string' ? input.mimeType.trim().toLowerCase() : '';
  if (typeof input.mimeType !== 'string' || mimeType.length > 127 || /[\x00-\x1f\x7f-\x9f]/.test(input.mimeType) || !/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(mimeType)) errors.mimeType = 'Use a valid file type.';
  if (!Number.isSafeInteger(input.byteSize) || input.byteSize < 1 || input.byteSize > FILE_MAX_BYTES) errors.byteSize = 'Choose a non-empty file up to 5 MB (5 MiB).';
  const visibility = input.visibility ?? 'internal', deliverableId = input.deliverableId ?? null;
  if (!retry) {
    if (typeof input.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)) errors.form = 'Refresh the upload form before trying again.';
    if (!['internal', 'client', 'restricted'].includes(visibility)) errors.visibility = 'Choose visibility from the list.';
    if (deliverableId !== null && (typeof deliverableId !== 'string' || !deliverableId || deliverableId.length > 100)) errors.deliverableId = 'Choose a Deliverable from this Project.';
  }
  return Object.keys(errors).length ? { ok: false, reason: typeof input.byteSize === 'number' && input.byteSize > FILE_MAX_BYTES ? 'too_large' : 'invalid', errors }
    : { ok: true, value: { filename, mimeType, byteSize: input.byteSize, ...(!retry ? { visibility, deliverableId, requestId: input.requestId.toLowerCase() } : {}) } };
}

export function fileDisposition(filename) {
  const fallback = filename.replace(/[^a-zA-Z0-9 ._()-]/g, '_').replace(/^[. ]+/, '') || 'download';
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
