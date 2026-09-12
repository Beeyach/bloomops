'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/toast.mjs';
import { FILE_MAX_BYTES, FILE_METADATA_HEADER } from '@/lib/bloomops/file-values.mjs';
import { PROJECT_VISIBILITY_LABELS } from '@/lib/bloomops/project-values.mjs';
import { Button, Field, Notice, Section, fieldAria } from './Primitives';
import Dialog from './Dialog';
import { FileList } from './Files';
import { send } from './ClientOverview';

export default function FileControls({ projectId, contentId = null, portal = false, ads = false, summary, deliverables = [], mayManage, canRestrict }) {
  const router = useRouter(), pending = useRef(false), requestId = useRef(null), focusAfter = useRef(null);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [dialog, setDialog] = useState(null);
  const [file, setFile] = useState(null), [visibility, setVisibility] = useState('internal'), [deliverableId, setDeliverableId] = useState('');
  const [purpose, setPurpose] = useState(ads ? 'asset' : 'recording');
  const collection = contentId ? `/api/bloomops/${portal ? 'portal/recordings' : 'content'}/${contentId}/files` : `/api/bloomops/projects/${projectId}/files`;
  const itemPath = id => contentId ? `${collection}/${id}` : `/api/bloomops/files/${id}`;
  const [error, setError] = useState(''), [announcement, setAnnouncement] = useState('');
  useEffect(() => { setReady(true); }, []);
  useEffect(() => {
    if (!focusAfter.current || dialog || busy) return;
    const previous = focusAfter.current, fresh = summary.items.find(item => item.id === previous.id);
    if (fresh && fresh.revision <= previous.revision) return;
    if (document.activeElement === document.body) (document.querySelector(`[data-file-id="${CSS.escape(previous.id)}"] button:not(:disabled)`) || document.getElementById('upload-file'))?.focus();
    focusAfter.current = null;
  }, [summary, dialog, busy]);
  const close = useCallback(() => { if (!pending.current) setDialog(null); }, []);
  function open(kind, item = null) {
    setFile(null); setError(''); setVisibility(item?.visibility || 'internal'); setDeliverableId('');
    requestId.current = crypto.randomUUID(); setPurpose(ads ? 'asset' : 'recording'); setDialog({ kind, item });
  }
  async function submit(event) {
    event.preventDefault(); if (pending.current) return;
    const upload = ['upload', 'retry'].includes(dialog.kind);
    if (upload && (!file || file.size < 1 || file.size > FILE_MAX_BYTES)) {
      setError('Choose a non-empty file up to 5 MB (5 MiB).'); document.getElementById('file-upload')?.focus(); return;
    }
    pending.current = true; setBusy(true); setError('');
    try {
      let result;
      if (upload) {
        const input = { filename: file.name, mimeType: file.type || 'application/octet-stream', byteSize: file.size,
          ...(dialog.kind === 'upload' ? { requestId: requestId.current, ...portal ? {} : { visibility },
            ...contentId ? { purpose: portal ? 'recording' : purpose } : { deliverableId: deliverableId || null } } : {}) };
        const path = dialog.kind === 'retry' ? `${itemPath(dialog.item.id)}/retry` : collection;
        const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/octet-stream', [FILE_METADATA_HEADER]: encodeURIComponent(JSON.stringify(input)) }, body: file });
        result = await response.json();
        if (!response.ok) throw new Error(Object.values(result.errors || {}).join(' ') || result.error || 'Upload failed. Try again.');
      } else result = await send(itemPath(dialog.item.id), { method: 'PATCH', body: { operation: dialog.kind,
        expectedRevision: dialog.item.revision, ...(dialog.kind === 'visibility' ? { visibility } : {}) } });
      if (dialog.item && !result.unchanged) focusAfter.current = { id: dialog.item.id, revision: dialog.item.revision };
      const message = upload ? 'File uploaded.' : dialog.kind === 'archive' ? 'File archived.' : 'File visibility saved.';
      setDialog(null); setAnnouncement(message); toast(message); router.refresh();
    } catch (err) { setError(err.message || 'The file could not be saved. Try again.'); router.refresh(); }
    finally { pending.current = false; setBusy(false); }
  }
  return <Section id={contentId ? 'content-files' : 'project-files'} title={contentId ? portal ? 'Your recordings' : ads ? 'Creative assets' : 'Recordings & assets' : 'Files'} aside={mayManage && <Button id="upload-file" size="sm" disabled={busy || !ready} onClick={() => open('upload')}>{portal ? 'Upload recording' : ads ? 'Upload asset' : 'Upload file'}</Button>}>
    <p className="bo-small">{contentId ? portal ? 'Send a short recording for this request. Your team will take it from here.' : ads ? 'Working images and video for this creative. Client review is not available yet.' : 'Original recordings and production assets for this Content. Uploading does not change its production stage.' : 'Files for this Project and its Deliverables.'}</p>
    <FileList items={summary.items} portal={portal} content={Boolean(contentId)} controls={mayManage ? item => <>
      {!portal && item.status === 'ready' && <Button size="sm" disabled={busy || !ready} onClick={() => open('visibility', item)}>Change file visibility</Button>}
      {['failed', 'uploading'].includes(item.status) && <Button size="sm" disabled={busy || !ready} onClick={() => open('retry', item)}>Retry upload</Button>}
      {!portal && <Button size="sm" disabled={busy || !ready} onClick={() => open('archive', item)}>Archive file</Button>}
    </> : null} />
    <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    <Dialog open={Boolean(dialog)} onClose={close} title={dialog?.kind === 'archive' ? 'Archive file' : dialog?.kind === 'visibility' ? 'Change file visibility' : dialog?.kind === 'retry' ? 'Retry upload' : portal ? 'Upload recording' : ads ? 'Upload asset' : 'Upload file'}
      initialFocus={dialog?.kind === 'visibility' ? '#file-visibility' : dialog?.kind === 'archive' ? '#file-cancel' : '#file-upload'}>
      {dialog && <form onSubmit={submit} noValidate><div className="bo-dialog-body">
        {dialog.item && <p className="bo-body">{dialog.item.filename}</p>}
        {['upload', 'retry'].includes(dialog.kind) && <>
          <Field id="file-upload" label={dialog.kind === 'retry' ? 'Select the same original file' : 'File'} hint="Up to 5 MB (5 MiB)." error={error ? 'Check the file and upload details below.' : null}>
            <input {...fieldAria({ id: 'file-upload', hint: true, error: error || null })} className="bo-control bo-file-input" type="file" disabled={busy} onChange={event => setFile(event.target.files?.[0] || null)} required />
          </Field>
          {dialog.kind === 'retry' && <p className="bo-small">Use the same filename and contents. An interrupted upload can be retried after five minutes.</p>}
        </>}
        {dialog.kind === 'upload' && !contentId && <Field id="file-attachment" label="Attach to"><select id="file-attachment" className="bo-control" value={deliverableId} disabled={busy} onChange={event => setDeliverableId(event.target.value)}>
          <option value="">This Project</option>{deliverables.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select></Field>}
        {dialog.kind === 'upload' && contentId && !portal && !ads && <Field id="file-purpose" label="Purpose"><select id="file-purpose" className="bo-control" value={purpose} disabled={busy} onChange={event => setPurpose(event.target.value)}><option value="recording">Recording</option><option value="asset">Production asset</option></select></Field>}
        {!portal && ['upload', 'visibility'].includes(dialog.kind) && <Field id="file-visibility" label="File visibility" hint={ads ? 'Internal working media. Restricted assets require explicit Project assignment, except for Owners and Admins.' : contentId ? 'Clients can download only shared recordings while a shared Content item is waiting for their recording. Production assets stay internal in this phase.' : 'Clients can download only when this File, its Project and any attached Deliverable are all shared.'}><select {...fieldAria({ id: 'file-visibility', hint: true })} className="bo-control" value={visibility} disabled={busy} onChange={event => setVisibility(event.target.value)}>
          {Object.entries(PROJECT_VISIBILITY_LABELS).filter(([key]) => (!ads || key !== 'client') && (key !== 'restricted' || canRestrict)).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></Field>}
        {dialog.kind === 'upload' && !portal && <p className="bo-small">{contentId ? 'Content' : 'A Project'} can hold up to 200 files, including archived files.</p>}
        {portal && <p className="bo-small">Short clips only: up to 5 MB (5 MiB). If your recording is larger, ask your agency how to provide it. Recordings here are shared with your agency.</p>}
        {dialog.kind === 'archive' && <p className="bo-body">Remove this file from active lists and downloads. Archived files cannot be restored here.</p>}
        {busy && <p className="bo-small" role="status">{['upload', 'retry'].includes(dialog.kind) ? 'Uploading your file…' : 'Saving…'}</p>}
        {error && <Notice tone="error">{error}</Notice>}
      </div><div className="bo-dialog-actions"><Button id="file-cancel" onClick={close} disabled={busy}>Cancel</Button><Button type="submit" variant={dialog.kind === 'archive' ? 'danger' : 'primary'} loading={busy} disabled={busy}>
        {dialog.kind === 'archive' ? 'Archive file' : dialog.kind === 'visibility' ? 'Save file visibility' : 'Upload'}
      </Button></div></form>}
    </Dialog>
  </Section>;
}
