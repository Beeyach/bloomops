import { workQueryAccess } from './work-api-input.mjs';
import { json, requireAuthorized } from './access.mjs';
import { loadFileResource } from './file-access.mjs';
import { FILE_MAX_BYTES, FILE_METADATA_HEADER, validateFileInput } from './file-values.mjs';

export const fileAccess = (req, fileId, action = 'file.view', options = {}) => workQueryAccess(req, requireAuthorized(req,
  { action, resource: access => loadFileResource(access.db, access.actor, fileId, options) }));

export function fileResponse(result, status = 200) {
  if (result.ok) return json(result, status);
  if (result.reason === 'not_found') return json({ error: 'Not found.' }, 404);
  if (result.reason === 'forbidden') return json({ error: 'You do not have permission to do that.' }, 403);
  if (result.reason === 'conflict') return json({ error: 'This upload is in progress, changed, or uses different file details. Refresh and try again. An interrupted upload can be retried after five minutes.' }, 409);
  if (result.reason === 'too_large') return json({ error: 'Choose a file up to 5 MB (5 MiB).' }, 413);
  if (result.reason === 'upload_failed') return json({ error: 'The upload could not be completed. Refresh and retry with the same file.' }, 500);
  return json({ error: 'Some file details need a change.', errors: result.errors || {} }, 400);
}

// An exact, bounded ASCII header carries metadata; the body is only bytes.
// Do not call formData()/arrayBuffer() on an unbounded incoming request.
export async function readFileUpload(req, { retry = false, validate = validateFileInput } = {}) {
  const invalid = () => ({ response: json({ error: 'Select a file with valid upload details.' }, 400) });
  const large = () => ({ response: fileResponse({ reason: 'too_large' }) });
  if (req.headers.get('content-type') !== 'application/octet-stream' || req.headers.has('content-encoding')) return invalid();
  const header = req.headers.get(FILE_METADATA_HEADER);
  if (!header || header.length > 4096) return invalid();
  let input;
  try { input = JSON.parse(decodeURIComponent(header)); } catch { return invalid(); }
  const checked = validate(input, { retry });
  if (!checked.ok) return { response: fileResponse(checked) };
  const expected = checked.value.byteSize, declared = req.headers.get('content-length');
  if (declared !== null) {
    if (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared))) return invalid();
    if (Number(declared) > FILE_MAX_BYTES) return large();
    if (Number(declared) !== expected) return invalid();
  }
  if (!req.body) return invalid();
  const reader = req.body.getReader(), bytes = new Uint8Array(expected);
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > expected) { await reader.cancel(); return length > FILE_MAX_BYTES ? large() : invalid(); }
      bytes.set(value, length - value.byteLength);
    }
  } catch { return invalid(); }
  finally { reader.releaseLock(); }
  return length === expected ? { input, bytes } : invalid();
}
