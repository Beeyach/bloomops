// Untrusted selection only. Membership is resolved against verified identity.
export const WORKSPACE_COOKIE = 'bloomops.workspace';
export function selectedWorkspace(headers) {
  const values = String(headers?.get?.('cookie') || '').split(';').map(v => v.trim()).filter(v => v.startsWith(WORKSPACE_COOKIE + '='));
  if (!values.length) return null;
  if (values.length !== 1) return '__invalid_workspace_selection__';
  const value = values[0].slice(WORKSPACE_COOKIE.length + 1);
  return /^[a-zA-Z0-9_-]{1,200}$/.test(value) ? value : '__invalid_workspace_selection__';
}
export function workspaceCookie(workspaceId, secure) {
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(workspaceId)) throw new Error('Invalid workspace selector');
  return `${WORKSPACE_COOKIE}=${workspaceId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure ? '; Secure' : ''}`;
}
