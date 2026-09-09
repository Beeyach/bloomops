import { setup as content } from './_content.mjs';
import { memoryBucket } from './_files.mjs';
import { run, one, all } from './_bloomops-db.mjs';
import { uploadContentFile, retryContentFile, changeContentFile, listContentFiles, downloadContentFile } from '../lib/bloomops/content-files.mjs';
export async function setup(options = {}) {
  const t = await content(options);
  t.contentId = (await t.add({ visibility: 'client', recordingRequired: true }, { serviceEngagementId: 'social-service' })).contentId;
  run(t.raw, "UPDATE content_items SET stage='waiting_for_recording',stage_context='PRIVATE_WAITING' WHERE id=?", t.contentId);
  t.bucket = memoryBucket(); if (t.env) t.env.FILES = t.bucket;
  t.bytes = new TextEncoder().encode('A short original recording');
  t.input = extra => ({ requestId: crypto.randomUUID(), filename: 'recording.mp4', mimeType: 'video/mp4', byteSize: t.bytes.length, purpose: 'recording', ...extra });
  t.upload = (input = {}, extra = {}) => uploadContentFile(t.db, { actor: t.owner, bucket: t.bucket, contentId: t.contentId, input: t.input(input), bytes: t.bytes, ...extra });
  t.retry = (fileId, extra = {}) => retryContentFile(t.db, { actor: t.owner, bucket: t.bucket, contentId: t.contentId, fileId,
    input: { filename: 'recording.mp4', mimeType: 'video/mp4', byteSize: t.bytes.length }, bytes: t.bytes, ...extra });
  t.files = (actor = t.owner, options = {}) => listContentFiles(t.db, actor, t.contentId, options);
  t.download = (fileId, actor = t.owner, extra = {}) => downloadContentFile(t.db, { actor, bucket: t.bucket, fileId, ...extra });
  t.stored = id => one(t.raw, 'SELECT * FROM assets WHERE id=?', id);
  t.change = (fileId, operation, extra = {}) => changeContentFile(t.db, { actor: t.owner, bucket: t.bucket, contentId: t.contentId, fileId,
    operation, expectedRevision: t.stored(fileId).revision, ...extra });
  t.fileEvents = id => all(t.raw, "SELECT * FROM activity_events WHERE subject_type='file' AND subject_id=?", id);
  return t;
}
