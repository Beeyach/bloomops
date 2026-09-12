'use client';
import { useState } from 'react';
import Dialog from './Dialog';
import { Button, Field, Notice } from './Primitives';
import { ONBOARDING_ACTIONS } from '@/lib/bloomops/onboarding-guidance-values.mjs';

export default function OnboardingGuidance({ item, clientId, disabled, onSaved }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [instructions, setInstructions] = useState('');
  const [actionType, setActionType] = useState('link');
  const [url, setUrl] = useState('');
  const [revision, setRevision] = useState(0);
  const prefix = `guidance-${item.id}`;
  function edit() {
    setInstructions(item.instructions || '');
    setActionType(Object.hasOwn(ONBOARDING_ACTIONS, item.actionType) ? item.actionType : 'link');
    setUrl(item.actionUrl || ''); setRevision(item.guidanceRevision); setError(''); setOpen(true);
  }
  async function save(e) {
    e.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/bloomops/clients/${encodeURIComponent(clientId)}/onboarding/items/${encodeURIComponent(item.id)}/configure`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ instructions, actionType, actionUrl: actionType === 'confirmation' ? null : url.trim(), revision }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'The instructions could not be saved.');
      setOpen(false); onSaved();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <>
    <Button icon="settings" onClick={edit} disabled={disabled}>{item.guidanceReady ? 'Edit instructions' : 'Set up step'}</Button>
    <Dialog open={open} onClose={() => { if (!busy) setOpen(false); }} title={`Set up ${item.title}`} initialFocus={`#${prefix}-instructions`}>
      <form onSubmit={save}>
        <div className="bo-dialog-body bo-stack">
          <Field id={`${prefix}-instructions`} label="Client instructions" hint="Say what to do and what to provide. These instructions are visible to this Client.">
            <textarea id={`${prefix}-instructions`} aria-describedby={`${prefix}-instructions-hint`} className="bo-control bo-textarea" rows={4} maxLength={2000} required value={instructions} onChange={e => setInstructions(e.target.value)} />
          </Field>
          <Field id={`${prefix}-action`} label="Client action">
            <select id={`${prefix}-action`} className="bo-control" value={actionType} onChange={e => setActionType(e.target.value)}>
              {Object.entries(ONBOARDING_ACTIONS).map(([value, action]) => <option value={value} key={value}>{action.label}</option>)}
            </select>
          </Field>
          {actionType !== 'confirmation' ? <Field id={`${prefix}-url`} label="Destination link" hint={actionType === 'upload' ? 'Use an existing upload request or folder where this Client has permission to add files. Test its access before sharing.' : 'Use the actual HTTPS agreement, booking or instructions link intended for this Client.'}>
            <input id={`${prefix}-url`} aria-describedby={`${prefix}-url-hint`} className="bo-control" type="url" placeholder="https://" maxLength={2048} required value={url} onChange={e => setUrl(e.target.value)} />
          </Field> : <p className="bo-hint">Use for work completed outside the portal. Explain where and how in the instructions.</p>}
          <p className="bo-hint">Opening a link does not complete the step. The Client confirms after finishing the work; any required team verification still applies.</p>
          {error && <Notice tone="error">{error}</Notice>}
        </div>
        <div className="bo-dialog-actions"><Button disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Save instructions</Button></div>
      </form>
    </Dialog>
  </>;
}
