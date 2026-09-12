'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Field, Notice, fieldAria } from './Primitives';
import { send } from './ClientOverview';
import Dialog from './Dialog';
import { toast } from '@/lib/toast.mjs';
const endpoint = '/api/bloomops/systems/ghl-setup';
export default function GhlBuildSetup({ options: initialOptions }) {
  const [options, setOptions] = useState(initialOptions), [serviceTypeId, setServiceTypeId] = useState(''), [enabled, setEnabled] = useState(false);
  const [proposal, setProposal] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [mustRefresh, setMustRefresh] = useState(false);
  const pending = useRef(false), close = useCallback(() => { if (!pending.current) setProposal(null); }, []);
  useEffect(() => { setOptions(initialOptions); }, [initialOptions]);
  const selected = options.serviceTypes.find(item => item.id === serviceTypeId);
  const unchanged = enabled === !!selected?.binding?.enabled;
  const choose = id => { const item = options.serviceTypes.find(row => row.id === id); setServiceTypeId(id); setEnabled(!!item?.binding?.enabled); setError(''); };
  async function perform(action) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (err) { setError(err.message || 'The configuration could not be saved.'); setMustRefresh(true); setProposal(null); }
    finally { pending.current = false; setBusy(false); }
  }
  const refresh = () => perform(async () => {
    const fresh = await send(endpoint, { method: 'GET' });
    if (!fresh.ok) throw new Error('The configuration could not be loaded.');
    setOptions(fresh); setEnabled(!!fresh.serviceTypes.find(item => item.id === serviceTypeId)?.binding?.enabled); setMustRefresh(false);
  });
  const save = () => perform(async () => {
    const { name, ...input } = proposal;
    const result = await send(endpoint, { method: 'POST', body: input });
    if (!result.ok) throw new Error('The configuration result could not be verified. Refresh it before trying again.');
    setOptions(current => ({ ...current, serviceTypes: current.serviceTypes.map(item => item.id === input.serviceTypeId ? { ...item, binding: result.binding } : item) }));
    setProposal(null); setMustRefresh(false); toast(`GHL builds ${input.enabled ? 'enabled' : 'disabled'} for ${name}.`);
  });
  return <div className="bo-page-narrow">
    <p className="bo-body">Enabling GHL builds lets authorized project managers choose components and generate work in an empty planned project for that service.</p>
    <p className="bo-small">Existing projects stay as they are. This setup does not connect to or make changes in GHL.</p>
    {options.serviceTypes.length ? <form onSubmit={event => { event.preventDefault(); if (!selected?.available || unchanged || busy || mustRefresh) return;
      setProposal({ serviceTypeId, enabled, expectedBinding: selected.binding ? { id: selected.binding.id, revision: selected.binding.revision } : null, name: selected.name });
    }} className="bo-project-fields">
      <Field id="ghl-service-type" label="Service type"><select {...fieldAria({ id: 'ghl-service-type' })} className="bo-control" value={serviceTypeId} onChange={event => choose(event.target.value)} disabled={busy || mustRefresh}>
        <option value="">Choose a service type</option>{options.serviceTypes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></Field>
      {selected && (selected.available ? <>
        <p className="bo-small">{selected.binding?.enabled ? 'GHL builds are enabled for this service type.' : 'GHL builds are disabled for this service type.'}</p>
        <label className="bo-build-check"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} disabled={busy || mustRefresh} />Enable GHL builds</label>
      </> : <Notice>Another blueprint is already configured for this service type.</Notice>)}
      <div className="bo-dialog-actions"><Button onClick={refresh} disabled={busy}>Refresh configuration</Button><Button type="submit" variant="primary" disabled={!selected?.available || unchanged || busy || mustRefresh}>Review setup</Button></div>
    </form> : <Notice>No active Systems service types are available.</Notice>}
    {error && <Notice tone="error">{error} Refresh the configuration before making another change.</Notice>}
    {busy && !proposal && <p role="status" className="bo-small">Loading the current configuration…</p>}
    <Dialog open={!!proposal} onClose={close} title={proposal?.enabled ? 'Enable GHL builds' : 'Disable GHL builds'}>
      <div className="bo-dialog-body">
        <p className="bo-body">{proposal?.enabled ? `Enable GHL builds for ${proposal.name}?` : `Disable future GHL builds for ${proposal?.name}?`}</p>
        <p className="bo-small">{proposal?.enabled ? 'Authorized project managers can then choose the components to include in each new build.' : 'New builds will be unavailable for this service type. Existing work and saved build requests are kept.'}</p>
      </div>
      <div className="bo-dialog-actions"><Button onClick={close} disabled={busy}>Cancel</Button><Button variant="primary" onClick={save} disabled={busy} loading={busy}>{proposal?.enabled ? 'Enable builds' : 'Disable builds'}</Button></div>
    </Dialog>
  </div>;
}
