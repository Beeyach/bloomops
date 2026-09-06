'use client';

import { useEffect, useState } from 'react';
import { subscribeDialog, resolveDialog } from '@/lib/dialog.mjs';
import { subscribeToasts, dismissToast } from '@/lib/toast.mjs';
import Dialog from './Dialog';
import { Button } from './Primitives';
import { Icon } from './Icons';

// Shell infrastructure, mounted once by each shell: the confirmation
// dialog and the toast stack. Both read the same tiny stores the inherited
// application uses (lib/dialog.mjs, lib/toast.mjs), so a page anywhere
// calls confirmDialog(...) or toast(...) and never mounts its own host.

function ConfirmHost() {
  const [dialog, setDialog] = useState(null);
  const [text, setText] = useState('');
  useEffect(() => subscribeDialog(setDialog), []);
  useEffect(() => {
    if (dialog?.kind === 'prompt') setText(dialog.defaultValue || '');
  }, [dialog]);
  if (!dialog) return null;

  const cancel = () => resolveDialog(dialog.kind === 'prompt' ? null : false);
  const confirm = () => resolveDialog(dialog.kind === 'prompt' ? text.trim() || null : true);

  return (
    <Dialog open onClose={cancel} title={dialog.title || 'Are you sure?'} initialFocus={dialog.kind === 'prompt' ? 'input' : '[data-cancel]'}>
      {dialog.message && <p className="bo-body" style={{ whiteSpace: 'pre-line' }}>{dialog.message}</p>}
      {dialog.kind === 'prompt' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            confirm();
          }}
          style={{ marginTop: 16 }}
        >
          <label htmlFor="bo-prompt" className="bo-label">
            {dialog.placeholder || 'Value'}
          </label>
          <input id="bo-prompt" className="bo-control" value={text} onChange={(e) => setText(e.target.value)} placeholder={dialog.placeholder} />
        </form>
      )}
      <div className="bo-dialog-actions">
        <Button onClick={cancel} data-cancel="">
          {dialog.cancelLabel || 'Cancel'}
        </Button>
        <Button variant={dialog.danger ? 'danger' : 'primary'} onClick={confirm}>
          {dialog.confirmLabel || 'OK'}
        </Button>
      </div>
    </Dialog>
  );
}

function ToastHost() {
  const [items, setItems] = useState([]);
  useEffect(() => subscribeToasts(setItems), []);
  if (items.length === 0) return null;
  return (
    <div className="bo-toasts">
      {items.map((t) => (
        <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'} className={`bo-toast ${t.tone === 'error' ? 'bo-toast-error' : 'bo-toast-info'}`}>
          <Icon name={t.tone === 'error' ? 'alert' : 'check'} />
          <span className="bo-toast-text">{t.message}</span>
          {t.action && (
            <button
              type="button"
              className="bo-btn bo-btn-sm"
              style={{ '--btn-bg': 'transparent', '--btn-fg': 'var(--bo-snow)', '--btn-border': 'rgb(255 255 255 / 0.3)', '--btn-bg-hover': 'rgb(255 255 255 / 0.1)' }}
              onClick={() => {
                dismissToast(t.id);
                t.action.onClick();
              }}
            >
              {t.action.label}
            </button>
          )}
          <button type="button" className="bo-toast-dismiss" onClick={() => dismissToast(t.id)} aria-label="Dismiss">
            <Icon name="x" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

export default function ShellHosts() {
  return (
    <>
      <ConfirmHost />
      <ToastHost />
    </>
  );
}
