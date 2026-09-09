'use client';
import { PlatformInput,platformLines } from './ContentPlatforms';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/toast.mjs';
import { CONTENT_TYPE_LABELS, CONTENT_TEXT_LIMITS, CONTENT_FLAG_DEFAULTS, CONTENT_VISIBILITY_LABELS } from '@/lib/bloomops/content-values.mjs';
import { Button, Field, Notice, fieldAria } from './Primitives';
import { send } from './ClientOverview';

const textLabels = { title: 'Title', pillar: 'Content pillar', hook: 'Hook', script: 'Script', caption: 'Caption', cta: 'Call to action' };
const flagLabels = { recordingRequired: 'Recording required', internalReviewRequired: 'Internal review required', clientApprovalRequired: 'Client approval required' };
export default function ContentForm({ item = null, options }) {
  const router = useRouter(), pending = useRef(false), requestId = useRef(null);
  const [busy, setBusy] = useState(false), [errors, setErrors] = useState({}), [error, setError] = useState('');
  const [parentIndex, setParentIndex] = useState('');
  const [values, setValues] = useState({ ...Object.fromEntries(Object.keys(CONTENT_TEXT_LIMITS).map(k => [k, item?.[k] || ''])),
    type: item?.type || 'reel', ownerMembershipId: item?.ownerMembershipId || '', visibility: item?.visibility || 'internal', targetPublishDate: item?.targetPublishDate || '',
    ...Object.fromEntries(Object.entries(CONTENT_FLAG_DEFAULTS).map(([k, v]) => [k, item?.[k] ?? v])) });
  const [platformText,setPlatformText]=useState('');
  const parent = item ? options.parents.find(p => p.clientId === item.clientId && p.serviceEngagementId === item.serviceEngagementId) : options.parents[Number(parentIndex)];
  const canRestrict = item?.visibility === 'restricted' || parent?.canRestrict;
  const owners = item?.ownerMembershipId && !options.members.some(m => m.membershipId === item.ownerMembershipId)
    ? [{ membershipId: item.ownerMembershipId, name: `${item.ownerName || 'Previous owner'} (current selection)` }, ...options.members] : options.members;
  const set = key => e => setValues(v => ({ ...v, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const aria = key => fieldAria({ id: `content-${key}`, error: errors[key] });
  async function submit(e) {
    e.preventDefault(); if (pending.current) return;
    const next = {};
    if (!item && parentIndex === '') next.parent = 'Choose a Client and service context.';
    if (!values.title.trim()) next.title = 'Enter a Content title.';
    setErrors(next); setError('');
    if (Object.keys(next).length) { document.getElementById(`content-${Object.keys(next)[0]}`)?.focus(); return; }
    pending.current = true; setBusy(true); requestId.current ||= crypto.randomUUID();
    try {
      const path = item ? `/api/bloomops/content/${item.id}` : `/api/bloomops/clients/${parent.clientId}${parent.serviceEngagementId ? `/services/${parent.serviceEngagementId}` : ''}/content`;
      const result = await send(path, { method: item ? 'PATCH' : 'POST', body: { ...values, ...(!item?{platforms:platformLines(platformText)}:{}), ...(item ? { expectedRevision: item.revision } : { requestId: requestId.current }) } });
      toast(item ? 'Content details saved.' : 'Content created.'); router.push(`/social/${result.contentId}`); router.refresh();
    } catch (err) {
      setErrors(err.fields || {}); setError(err.fields?.form || err.message || 'Unable to save Content. Try again.');
      requestAnimationFrame(() => document.getElementById(`content-${Object.keys(err.fields || {})[0]}`)?.focus() || document.getElementById('content-save-error')?.focus());
    } finally { pending.current = false; setBusy(false); }
  }
  return <form className="bo-form bo-content-form" onSubmit={submit} noValidate aria-busy={busy}>
    <fieldset disabled={busy} className="bo-content-fields">
      <legend className="bo-h2">Content details</legend>
      {!item && <Field id="content-parent" label="Client and service" error={errors.parent} hint="Choose Client-level Content or one purchased Social service. This stays fixed after creation.">
        <select {...aria('parent')} aria-describedby={`content-parent-hint${errors.parent ? ' content-parent-error' : ''}`} className="bo-control" value={parentIndex} onChange={e => { setParentIndex(e.target.value); setValues(v => ({ ...v, visibility: 'internal' })); }} required>
          <option value="">Choose a context</option>{options.parents.map((p, i) => <option key={`${p.clientId}:${p.serviceEngagementId}`} value={i}>{p.clientName} · {p.serviceName ? `${p.serviceName}${p.packageName ? ` — ${p.packageName}` : ''}` : 'Client-level Content'}</option>)}
        </select>
      </Field>}
      {['title', 'pillar'].map(key => <Field key={key} id={`content-${key}`} label={textLabels[key]} optional={key !== 'title'} error={errors[key]}><input {...aria(key)} className="bo-control" value={values[key]} onChange={set(key)} maxLength={CONTENT_TEXT_LIMITS[key]} required={key === 'title'} /></Field>)}
      <Field id="content-type" label="Content type" error={errors.type}><select {...aria('type')} className="bo-control" value={values.type} onChange={set('type')}>{Object.entries(CONTENT_TYPE_LABELS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></Field>
      <Field id="content-ownerMembershipId" label="Internal owner" optional error={errors.ownerMembershipId} hint="Responsibility for the item. Access comes from Client and service assignments."><select {...aria('ownerMembershipId')} aria-describedby={`content-ownerMembershipId-hint${errors.ownerMembershipId ? ' content-ownerMembershipId-error' : ''}`} className="bo-control" value={values.ownerMembershipId} onChange={set('ownerMembershipId')}><option value="">Nobody yet</option>{owners.map(m => <option key={m.membershipId} value={m.membershipId}>{m.name}</option>)}</select></Field>
      {options.membersOverflow && <Notice>The first 200 active owners are shown. You can leave ownership unset.</Notice>}
      {['hook', 'script', 'caption', 'cta'].map(key => <Field key={key} id={`content-${key}`} label={textLabels[key]} optional error={errors[key]}><textarea {...aria(key)} className="bo-control" rows={key === 'script' ? 10 : 4} value={values[key]} onChange={set(key)} maxLength={CONTENT_TEXT_LIMITS[key]} /></Field>)}
      <Field id="content-targetPublishDate" label="Target publish date" optional error={errors.targetPublishDate}><input {...aria('targetPublishDate')} className="bo-control" type="date" value={values.targetPublishDate} onChange={set('targetPublishDate')} /></Field>
      {!item && <PlatformInput error={errors.platforms} value={platformText} onChange={e=>setPlatformText(e.target.value)} disabled={busy} />}
      <fieldset className="bo-content-flags"><legend className="bo-label">Workflow requirements</legend>{Object.entries(flagLabels).map(([key, label]) => <div key={key}><label className="bo-content-check"><input {...aria(key)} type="checkbox" checked={values[key]} onChange={set(key)} />{label}</label>{errors[key] && <p id={`content-${key}-error`} role="alert">{errors[key]}</p>}</div>)}</fieldset>
      <Field id="content-visibility" label="Visibility" error={errors.visibility} hint="Client eligible shares only the title and recording request while recording is required and this item is Waiting for Recording. Editorial details and internal context stay private."><select {...aria('visibility')} aria-describedby={`content-visibility-hint${errors.visibility ? ' content-visibility-error' : ''}`} className="bo-control" value={values.visibility} onChange={set('visibility')}>{Object.entries(CONTENT_VISIBILITY_LABELS).filter(([v]) => v !== 'restricted' || canRestrict).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></Field>
    </fieldset>
    {error && <div id="content-save-error" tabIndex={-1}><Notice tone="error">{error}</Notice></div>}
    <div className="bo-form-actions"><Button href={item ? `/social/${item.id}` : '/social'}>Cancel</Button><Button type="submit" variant="primary" loading={busy} disabled={busy}>{item ? 'Save details' : 'Create Content'}</Button></div>
  </form>;
}
