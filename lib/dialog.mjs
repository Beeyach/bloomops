// A tiny promise-based dialog system so nothing in the app ever falls back
// to the browser's default confirm()/prompt() boxes. A single <DialogHost>
// mounts at the app root and subscribes here; components just await
// confirmDialog(...) or promptDialog(...).

let current = null;
const listeners = new Set();

function emit() {
  for (const l of listeners) l(current);
}

export function subscribeDialog(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getDialog() {
  return current;
}

// Returns Promise<boolean>.
export function confirmDialog({ title, message, confirmLabel = 'Delete', cancelLabel = 'Cancel', danger = true } = {}) {
  return new Promise((resolve) => {
    current = { kind: 'confirm', title, message, confirmLabel, cancelLabel, danger, resolve };
    emit();
  });
}

// Returns Promise<string|null> (null when cancelled).
export function promptDialog({ title, message, placeholder = '', defaultValue = '', confirmLabel = 'Save' } = {}) {
  return new Promise((resolve) => {
    current = { kind: 'prompt', title, message, placeholder, defaultValue, confirmLabel, resolve };
    emit();
  });
}

// Called by the host to settle the open dialog.
export function resolveDialog(value) {
  if (!current) return;
  const resolve = current.resolve;
  current = null;
  emit();
  resolve(value);
}
