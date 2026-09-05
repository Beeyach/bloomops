// A tiny toast system, same shape as dialog.mjs: one <ToastHost> mounts at
// the app root and subscribes here; anything in the app calls toast(...).
// Exists so edits stop failing into browser alert() boxes, and so a
// mis-click on a dropdown is one click from undone instead of silently
// permanent.

let toasts = [];
let nextId = 1;
const listeners = new Set();

function emit() {
  for (const l of listeners) l(toasts);
}

export function subscribeToasts(fn) {
  listeners.add(fn);
  fn(toasts);
  return () => listeners.delete(fn);
}

export function dismissToast(id) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

// toast('Stage → Email 3', { action: { label: 'Undo', onClick } })
// toast('Save failed: …', { tone: 'error', action: { label: 'Retry', onClick } })
// Auto-dismisses (errors linger longer); the action stays clickable until then.
export function toast(message, { tone = 'info', action = null, duration } = {}) {
  const id = nextId++;
  const ms = duration ?? (tone === 'error' ? 8000 : 5000);
  toasts = [...toasts.slice(-2), { id, message: String(message), tone, action }];
  emit();
  setTimeout(() => dismissToast(id), ms);
  return id;
}
