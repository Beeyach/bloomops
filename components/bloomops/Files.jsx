'use client';
import { useEffect, useState } from 'react';
import { fileSize, FILE_STATUS_LABELS } from '@/lib/bloomops/file-values.mjs';
import { formatDate } from '@/lib/bloomops/format.mjs';
import { Button, Notice, Status } from './Primitives';

export function FileDownload({ file }) {
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { setReady(true); }, []);
  async function download() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/bloomops/files/${file.id}/download`, { cache: 'no-store' });
      if (!response.ok) throw new Error('This file is unavailable. Refresh the page and try again.');
      const blob = await response.blob(), url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = file.filename; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { setError(err.message || 'The file could not be downloaded. Try again.'); }
    finally { setBusy(false); }
  }
  return <div className="bo-file-download"><Button size="sm" disabled={!ready || busy} loading={busy} onClick={download} aria-label={`Download ${file.filename}`}>Download</Button>
    {error && <Notice tone="error">{error}</Notice>}</div>;
}

export function FileList({ items = [], controls = null, portal = false }) {
  if (!items.length) return <p className="bo-body">No files to show yet.</p>;
  return <ul className="bo-files" aria-label={portal ? 'Shared files' : 'Project files'}>{items.map(file => <li className="bo-file" data-file-id={file.id} key={file.id}>
    <div className="bo-file-heading"><h3 className="bo-row-title">{file.filename}</h3>{!portal && <Status label={FILE_STATUS_LABELS[file.status]} tone={file.status === 'failed' ? 'error' : 'neutral'} />}</div>
    <p className="bo-small">{[fileSize(file.byteSize), file.mimeType, formatDate(file.readyAt || file.createdAt)].filter(Boolean).join(' · ')}</p>
    {(portal ? file.attachmentLabel : file.deliverableTitle) && <p className="bo-small">For {portal ? file.attachmentLabel : file.deliverableTitle}</p>}
    {!portal && <p className="bo-small">{file.visibility === 'client' ? 'Client visible when the Project and attachment are shared' : file.visibility === 'restricted' ? 'Restricted' : 'Internal'}</p>}
    <div className="bo-file-controls">{(portal || file.status === 'ready') && <FileDownload file={file} />}{controls?.(file)}</div>
  </li>)}</ul>;
}

export function PortalFiles({ summary }) {
  if (!summary?.items.length) return null;
  return <div className="bo-portal-files"><h3 className="bo-row-title">Files</h3><FileList items={summary.items} portal /></div>;
}

export function DeliverableFiles({ items = [] }) {
  const ready = items.filter(file => file.status === 'ready');
  if (!ready.length) return null;
  return <div className="bo-deliverable-files"><p className="bo-small">Attached files</p><ul className="bo-files">{ready.map(file => <li className="bo-file-attachment" key={file.id}><span>{file.filename} · {fileSize(file.byteSize)}</span><FileDownload file={file} /></li>)}</ul></div>;
}
