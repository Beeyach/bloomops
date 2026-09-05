// Workspace pages live at a readable hash: #page/pipeline-report-b959d454.
// The trailing 8 characters are the page id's prefix, which is what makes the
// link resolve — two pages both called "Untitled" still get their own URL.
// The slug in front is purely for the human reading the address bar.

export function pageSlug(title) {
  const s = String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return s || 'page';
}

export function pageHash(page) {
  const id = String(page?.id || '');
  return `page/${pageSlug(page?.title)}-${id.slice(0, 8)}`;
}
