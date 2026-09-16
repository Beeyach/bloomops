'use client';
import { useEffect, useState } from 'react';
import { fileSize, FILE_STATUS_LABELS } from '@/lib/bloomops/file-values.mjs';
import { formatDate } from '@/lib/bloomops/format.mjs';
import { Button, Notice, Status } from './Primitives';

export function FileDownload({ file, downloadBase = null }) {
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { setReady(true); }, []);
  async function download() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(downloadBase ? `${downloadBase}/files/${file.id}` : `/api/bloomops/files/${file.id}/download`, { cache: 'no-store' });
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

export function FileList({ items = [], controls = null, portal = false, content = false, downloadBase = null }) {
  if (!items.length) return <p className="bo-body">No files to show yet.</p>;
  return <ul className="bo-files" aria-label={portal ? content ? 'Your recordings' : 'Shared files' : content ? 'Content files' : 'Project files'}>{items.map(file => <li className="bo-file" data-file-id={file.id} key={file.id}>
    <div className="bo-file-heading"><h3 className="bo-row-title">{file.filename}</h3>{(!portal || content) && <Status label={FILE_STATUS_LABELS[file.status]} tone={file.status === 'failed' ? 'error' : 'neutral'} />}</div>
    <dl className="bo-file-properties"><div><dt>Size</dt><dd>{fileSize(file.byteSize)}</dd></div><div><dt>Type</dt><dd>{file.mimeType}</dd></div><div><dt>Added</dt><dd>{formatDate(file.readyAt || file.createdAt)}</dd></div></dl>
    {(portal ? file.attachmentLabel : file.deliverableTitle) && <p className="bo-small">For {portal ? file.attachmentLabel : file.deliverableTitle}</p>}
    {!portal && <p className="bo-small">{content && <span className="bo-pagination-note">{file.purpose === 'recording' ? 'Recording' : 'Production asset'}</span>}{file.visibility === 'client' ? content ? 'Client eligible under the recording request rules' : 'Client visible when the Project and attachment are shared' : file.visibility === 'restricted' ? 'Restricted' : 'Internal'}</p>}
    <div className="bo-file-controls">{((portal && !content) || file.status === 'ready') && <FileDownload file={file} downloadBase={downloadBase} />}{controls?.(file)}</div>
  </li>)}</ul>;
}

export function PortalFiles({ summary, downloadBase = null }) {
  if (!summary?.items.length) return null;
  return <div className="bo-portal-files"><h3 className="bo-row-title">Files</h3><FileList items={summary.items} portal downloadBase={downloadBase} /></div>;
}

export function DeliverableFiles({ items = [] }) {
  const ready = items.filter(file => file.status === 'ready');
  if (!ready.length) return null;
  return <div className="bo-deliverable-files"><p className="bo-small">Attached files</p><ul className="bo-files">{ready.map(file => <li className="bo-file-attachment" key={file.id}><span className="bo-record-subtitle"><span>{file.filename}</span><span>{fileSize(file.byteSize)}</span></span><FileDownload file={file} /></li>)}</ul></div>;
}
