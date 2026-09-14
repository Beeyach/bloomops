import StarterKit from '@tiptap/starter-kit';
// A page mention ends at its label. Keep URL detection, but do not inherit the
// link mark when typing immediately after a saved/reloaded label.
export const pageLinkStarterKit = StarterKit.extend({
  addExtensions() {
    return this.parent().map(extension => extension.name === 'link' ? extension.extend({inclusive: false}) : extension);
  },
});

// Input is the current user's server-authorized metadata tree, never documents.
const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(value);
export function pageLinkRows(pages, workspaceId, query = '') {
  if (!identifier(workspaceId) || !Array.isArray(pages)) return [];
  const needle = String(query).trim().toLocaleLowerCase();
  return pages.filter(page => identifier(page?.id) && (!needle || String(page.title || '').toLocaleLowerCase().includes(needle)))
    .slice(0, 8).map(page => ({
      key: `page-${page.id}`,
      icon: 'file',
      label: page.title || 'Untitled',
      href: `/shared-pages/${encodeURIComponent(page.id)}?workspace=${encodeURIComponent(workspaceId)}`,
    }));
}
