'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/toast.mjs';
import { Button, Notice, Section } from './Primitives';
import Dialog from './Dialog';

const validPacket = p => p && Object.keys(p).sort().join() === 'expected,requestId,selectedComponentKeys'
  && typeof p.requestId === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(p.requestId)
  && Array.isArray(p.selectedComponentKeys) && p.selectedComponentKeys.length > 0 && p.selectedComponentKeys.length <= 14
  && p.selectedComponentKeys.every(k => typeof k === 'string' && /^[a-z0-9_]{1,64}$/.test(k))
  && p.expected && Object.keys(p.expected).sort().join() === 'bindingId,bindingRevision,definitionHash,projectRevision,templateVersionId'
  && ['projectRevision', 'bindingRevision'].every(k => Number.isSafeInteger(p.expected[k]) && p.expected[k] >= 1)
  && ['bindingId', 'templateVersionId'].every(k => typeof p.expected[k] === 'string' && p.expected[k].length > 0 && p.expected[k].length <= 200)
  && typeof p.expected.definitionHash === 'string' && /^[a-f0-9]{64}$/.test(p.expected.definitionHash);

async function request(path, body) {
  const response = await fetch(path, { method: body ? 'POST' : 'GET', cache: 'no-store',
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) { const error = new Error(data.error || 'The request could not be completed.'); error.restartAllowed = data.restartAllowed === true; throw error; }
  if (data.ok !== true) throw new Error('The build result could not be verified.');
  return data;
}

export default function SystemsBuildControls({ projectId, retryScope, options: initialOptions }) {
  const router = useRouter(), pending = useRef(false);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [ready, setReady] = useState(false);
  const [options, setOptions] = useState(initialOptions), [selected, setSelected] = useState([]), [preview, setPreview] = useState(null);
  const [packet, setPacket] = useState(null), [storageError, setStorageError] = useState(''), [error, setError] = useState(''), [restartAllowed, setRestartAllowed] = useState(false);
  const platform = options?.blueprintKey === 'kajabi_build' ? 'Kajabi' : 'GHL';
  // Preserve D2 storage keys and packet shape for outstanding requests.
  const storageKey = `bloomops:ghl:${retryScope}:${projectId}`, path = `/api/bloomops/projects/${encodeURIComponent(projectId)}/blueprint`;
  const close = useCallback(() => { if (!pending.current) setOpen(false); }, []);
  useEffect(() => { setOptions(initialOptions); }, [initialOptions]);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        if (raw.length > 4096) throw new Error();
        const restored = JSON.parse(raw); if (!validPacket(restored)) throw new Error(); setPacket(restored);
      }
    } catch { setStorageError('This tab cannot restore a saved build request. Check the project before starting a build in another tab.'); }
    setReady(true);
  }, [storageKey]);

  async function perform(action) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(''); setRestartAllowed(false);
    try { await action(); }
    catch (err) { setError(err.message || 'The request could not be completed.'); setRestartAllowed(err.restartAllowed === true); }
    finally { pending.current = false; setBusy(false); }
  }
  const showPreview = () => perform(async () => {
    const result = await request(`${path}/preview`, { selectedComponentKeys: selected }); setPreview(result);
  });
  const confirm = () => perform(async () => {
    const input = packet || { requestId: crypto.randomUUID(), selectedComponentKeys: preview.plan.selectedComponentKeys, expected: preview.expected };
    if (!packet) {
      // Persist before sending. A storage failure must not create an unrecoverable request.
      try { sessionStorage.setItem(storageKey, JSON.stringify(input)); }
      catch { throw new Error('This tab cannot save a retry request. Allow session storage before generating work.'); }
      setPacket(input);
    }
    const result = await request(`${path}/generate`, input);
    if (result.projectId !== projectId || typeof result.generationId !== 'string' || !result.counts) throw new Error('The build result could not be verified. Retry this request.');
    try { sessionStorage.removeItem(storageKey); } catch { /* A retained exact retry remains safe. */ }
    setPacket(null); setOptions(null); setOpen(false); setPreview(null);
    toast(result.replayed ? 'Your build was already saved.' : 'Systems work generated.'); router.refresh();
  });
  const restart = () => perform(async () => {
    // A completed domain rejection plus a fresh eligible empty Project permits a new preview.
    const fresh = await request(path);
    sessionStorage.removeItem(storageKey); setPacket(null); setPreview(null); setSelected([]); setOptions(fresh);
  });
  if (!ready || (!options?.ok && !packet && !storageError)) return null;
  if (storageError && !options?.ok && !packet) return null;
  return <>
    <Section id="project-systems-build" title={packet ? 'Saved build request' : `${platform} build`} aside={<Button onClick={() => { setOpen(true); setError(''); }} disabled={!!storageError}>
      {packet ? 'Resume build request' : `Start ${platform} build`}
    </Button>}>
      <p className="bo-body">{packet ? 'A previous request needs a result. Resume it to check or safely retry the same build.' : 'Choose the components this project needs, then review the work before creating it.'}</p>
      {storageError && <Notice tone="error">{storageError}</Notice>}
    </Section>
    <Dialog open={open} onClose={close} title={packet ? 'Resume build' : preview ? `Review ${platform} work` : `Choose ${platform} components`}>
      <div className="bo-dialog-body" aria-busy={busy}>
        {packet ? <p className="bo-body">Retry the saved request to confirm its result. Work that was already saved will be kept without duplication.</p> : preview ? <>
          <p className="bo-body">{preview.plan.milestones.length} milestones · {preview.plan.actions.length} actions · {preview.plan.deliverables.length} deliverables</p>
          <p className="bo-small">Work starts internal, without assignments or dates. The project stays Planned.</p>
          {[['Milestones', preview.plan.milestones, 'name'], ['Actions', preview.plan.actions, 'title'], ['Deliverables', preview.plan.deliverables, 'title']].map(([label, rows, title]) => <div key={label}>
            <h3 className="bo-h3">{label}</h3>{rows.length ? <ol className="bo-build-preview">{rows.map(row => <li key={row.logicalKey}>{row[title]}</li>)}</ol> : <p className="bo-small">None selected.</p>}
          </div>)}
          {preview.plan.dependencies.length > 0 && <details><summary className="bo-link bo-build-sequence">Work sequence ({preview.plan.dependencies.length} dependencies)</summary><ul className="bo-build-preview">{preview.plan.dependencies.map(edge => <li key={`${edge.actionKey}:${edge.dependsOnActionKey}`}>
            {preview.plan.actions.find(a => a.logicalKey === edge.actionKey)?.title} follows {preview.plan.actions.find(a => a.logicalKey === edge.dependsOnActionKey)?.title}
          </li>)}</ul></details>}
        </> : <>
          <p className="bo-body">Select only the components included in this build.</p>
          <fieldset className="bo-build-selection" disabled={busy}><legend className="bo-label">Build components</legend>
            {options?.components.map(component => <label className="bo-build-check" key={component.key}>
              <input type="checkbox" checked={selected.includes(component.key)} onChange={event => { setSelected(keys => event.target.checked ? [...keys, component.key] : keys.filter(key => key !== component.key)); setError(''); }} />{component.label}
            </label>)}
          </fieldset>
        </>}
        {error && <Notice tone="error">{error}</Notice>}
        {busy && <p role="status" className="bo-small">{packet ? 'Checking and saving your build…' : 'Preparing your build…'}</p>}
      </div>
      <div className="bo-dialog-actions">
        <Button onClick={close} disabled={busy}>Close</Button>
        {!packet && preview && <Button onClick={() => { setPreview(null); setError(''); }} disabled={busy}>Back to components</Button>}
        {packet && restartAllowed && <Button onClick={restart} disabled={busy}>Refresh preview</Button>}
        <Button variant="primary" onClick={packet || preview ? confirm : showPreview} disabled={busy || (!packet && !preview && selected.length === 0)} loading={busy}>
          {packet ? 'Retry this request' : preview ? 'Generate work' : 'Preview work'}
        </Button>
      </div>
    </Dialog>
  </>;
}
