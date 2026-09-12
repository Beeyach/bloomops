'use client';
import { PlatformInput,platformLines } from './ContentPlatforms';
import { REVIEW_FROZEN_FIELDS } from '@/lib/bloomops/content-approval-values.mjs';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/toast.mjs';
import { CONTENT_TYPE_LABELS, CONTENT_TEXT_LIMITS, CONTENT_FLAG_DEFAULTS, CONTENT_VISIBILITY_LABELS } from '@/lib/bloomops/content-values.mjs';
import { Button, Field, Notice, fieldAria } from './Primitives';
import { send } from './ClientOverview';

const textLabels = { title: 'Title', pillar: 'Content pillar', hook: 'Hook', script: 'Script', caption: 'Caption', cta: 'Call to action' };
const flagLabels = { recordingRequired: 'Recording required', internalReviewRequired: 'Internal review required', clientApprovalRequired: 'Client approval required' };
export default function ContentForm({ item = null, options, area = 'social' }) {
  const ads = area === 'ads', base = ads ? '/ads/creative' : '/social';
  const router = useRouter(), pending = useRef(false), requestId = useRef(null);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [busy, setBusy] = useState(false), [errors, setErrors] = useState({}), [error, setError] = useState('');
  const [parentIndex, setParentIndex] = useState(options.selectedProjectId ? String(options.parents.findIndex(p=>p.projectId===options.selectedProjectId)) : '');
  const [values, setValues] = useState({ ...Object.fromEntries(Object.keys(CONTENT_TEXT_LIMITS).map(k => [k, item?.[k] || ''])),
    type: item?.type || (ads ? 'ad_creative' : 'reel'), ownerMembershipId: item?.ownerMembershipId || '', visibility: item?.visibility || 'internal', targetPublishDate: item?.targetPublishDate || '',
    ...Object.fromEntries(Object.entries(CONTENT_FLAG_DEFAULTS).map(([k, v]) => [k, item?.[k] ?? v])) });
  const [platformText,setPlatformText]=useState('');
  const parent = item ? options.parents.find(p => ads ? p.projectId === item.adsProjectId : p.clientId === item.clientId && p.serviceEngagementId === item.serviceEngagementId) : options.parents[Number(parentIndex)];
  const canRestrict = item?.visibility === 'restricted' || parent?.canRestrict;
  const owners = item?.ownerMembershipId && !options.members.some(m => m.membershipId === item.ownerMembershipId)
    ? [{ membershipId: item.ownerMembershipId, name: `${item.ownerName || 'Previous owner'} (current selection)` }, ...options.members] : options.members;
  const set = key => e => setValues(v => ({ ...v, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const aria = key => ({...fieldAria({ id: `content-${key}`, error: errors[key] }),disabled:!!item?.approvalRequested&&REVIEW_FROZEN_FIELDS.includes(key)});
  async function submit(e) {
    e.preventDefault(); if (!ready || pending.current) return;
    const next = {};
    if (!item && parentIndex === '') next.parent = ads ? 'Choose an Ads Project.' : 'Choose a Client and service context.';
    if (!values.title.trim()) next.title = 'Enter a Content title.';
    setErrors(next); setError('');
    if (Object.keys(next).length) { document.getElementById(`content-${Object.keys(next)[0]}`)?.focus(); return; }
    pending.current = true; setBusy(true); requestId.current ||= crypto.randomUUID();
    try {
      const path = item ? `/api/bloomops/content/${item.id}` : ads ? `/api/bloomops/projects/${parent.projectId}/creative` : `/api/bloomops/clients/${parent.clientId}${parent.serviceEngagementId ? `/services/${parent.serviceEngagementId}` : ''}/content`;
      const result = await send(path, { method: item ? 'PATCH' : 'POST', body: { ...Object.fromEntries(Object.entries(values).filter(([k])=>!ads || !Object.hasOwn(CONTENT_FLAG_DEFAULTS,k))), ...(!item?{platforms:platformLines(platformText)}:{}), ...(item ? { expectedRevision: item.revision } : { requestId: requestId.current }) } });
      toast(item ? 'Content details saved.' : 'Content created.'); router.push(`${base}/${result.contentId}`); router.refresh();
    } catch (err) {
      setErrors(err.fields || {}); setError(err.fields?.form || err.message || 'Unable to save Content. Try again.');
      requestAnimationFrame(() => document.getElementById(`content-${Object.keys(err.fields || {})[0]}`)?.focus() || document.getElementById('content-save-error')?.focus());
    } finally { pending.current = false; setBusy(false); }
  }
  return <form className="bo-form bo-content-form" onSubmit={submit} noValidate aria-busy={busy}>
    {item?.approvalRequested&&<Notice>Reviewed copy, workflow requirements and target date are frozen. Withdraw the approval request to revise them. Visibility and internal ownership remain editable.</Notice>}
    <fieldset disabled={!ready || busy} className="bo-content-fields">
      <legend className="bo-h2">Content details</legend>
      {!item && <Field id="content-parent" label={ads ? 'Ads Project' : 'Client and service'} error={errors.parent} hint={ads ? 'The Project, Client and service stay fixed after creation.' : 'Choose Client-level Content or one purchased Social service. This stays fixed after creation.'}>
        <select {...aria('parent')} aria-describedby={`content-parent-hint${errors.parent ? ' content-parent-error' : ''}`} className="bo-control" value={parentIndex} onChange={e => { setParentIndex(e.target.value); setValues(v => ({ ...v, visibility: 'internal' })); }} required>
          <option value="">Choose a context</option>{options.parents.map((p, i) => <option key={p.projectId || `${p.clientId}:${p.serviceEngagementId}`} value={i}>{ads ? `${p.projectName} — Client: ${p.clientName} — Service: ${p.serviceName}` : <>{p.clientName} · {p.serviceName ? `${p.serviceName}${p.packageName ? ` — ${p.packageName}` : ''}` : 'Client-level Content'}</>}</option>)}
        </select>
      </Field>}
      {['title', 'pillar'].map(key => <Field key={key} id={`content-${key}`} label={textLabels[key]} optional={key !== 'title'} error={errors[key]}><input {...aria(key)} className="bo-control" value={values[key]} onChange={set(key)} maxLength={CONTENT_TEXT_LIMITS[key]} required={key === 'title'} /></Field>)}
      <Field id="content-type" label="Content type" error={errors.type}><select {...aria('type')} className="bo-control" value={values.type} onChange={set('type')}>{Object.entries(CONTENT_TYPE_LABELS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></Field>
      <Field id="content-ownerMembershipId" label="Internal owner" optional error={errors.ownerMembershipId} hint={ads ? 'Responsibility for the creative. Access follows its Project and visibility.' : 'Responsibility for the item. Access comes from Client and service assignments.'}><select {...aria('ownerMembershipId')} aria-describedby={`content-ownerMembershipId-hint${errors.ownerMembershipId ? ' content-ownerMembershipId-error' : ''}`} className="bo-control" value={values.ownerMembershipId} onChange={set('ownerMembershipId')}><option value="">Nobody yet</option>{owners.map(m => <option key={m.membershipId} value={m.membershipId}>{m.name}</option>)}</select></Field>
      {options.membersOverflow && <Notice>The first 200 active owners are shown. You can leave ownership unset.</Notice>}
      {['hook', 'script', 'caption', 'cta'].map(key => <Field key={key} id={`content-${key}`} label={textLabels[key]} optional error={errors[key]}><textarea {...aria(key)} className="bo-control" rows={key === 'script' ? 10 : 4} value={values[key]} onChange={set(key)} maxLength={CONTENT_TEXT_LIMITS[key]} /></Field>)}
      <Field id="content-targetPublishDate" label="Target publish date" optional error={errors.targetPublishDate}><input {...aria('targetPublishDate')} className="bo-control" type="date" value={values.targetPublishDate} onChange={set('targetPublishDate')} /></Field>
      {!item && <PlatformInput error={errors.platforms} value={platformText} onChange={e=>setPlatformText(e.target.value)} disabled={busy} />}
      {!ads && <fieldset className="bo-content-flags"><legend className="bo-label">Workflow requirements</legend>{Object.entries(flagLabels).map(([key, label]) => <div key={key}><label className="bo-content-check"><input {...aria(key)} type="checkbox" checked={values[key]} onChange={set(key)} />{label}</label>{errors[key] && <p id={`content-${key}-error`} role="alert">{errors[key]}</p>}</div>)}</fieldset>}
      <Field id="content-visibility" label="Visibility" error={errors.visibility} hint={ads ? 'Internal work for your team. Restricted creative requires an explicit Project assignment, except for Owners and Admins.' : 'Client eligible shares a Content summary, requested recordings and explicitly requested approval snapshots with linked Clients. Internal notes stay private. Revoking visibility also hides an open approval request.'}><select {...aria('visibility')} aria-describedby={`content-visibility-hint${errors.visibility ? ' content-visibility-error' : ''}`} className="bo-control" value={values.visibility} onChange={set('visibility')}>{Object.entries(CONTENT_VISIBILITY_LABELS).filter(([v]) => (!ads || v !== 'client') && (v !== 'restricted' || canRestrict)).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></Field>
    </fieldset>
    {error && <div id="content-save-error" tabIndex={-1}><Notice tone="error">{error}{ads && item && <> <a href={`${base}/${item.id}/edit`}>Reload creative</a></>}</Notice></div>}
    <div className="bo-form-actions"><Button href={item ? `${base}/${item.id}` : base}>Cancel</Button><Button type="submit" variant="primary" loading={busy} disabled={!ready || busy}>{item ? 'Save details' : ads ? 'Create creative' : 'Create Content'}</Button></div>
  </form>;
}
