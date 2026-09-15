// A non-null composite FK is an equally strong workspace anchor when every
// component is mandatory and the referenced workspace column is itself anchored.
// Never follow a nullable tuple (SQLite would allow it to bypass the FK), a
// renamed/unrelated workspace column, or a cycle with no workspaces root.
export function hasWorkspaceForeignKey(db, table, visited = new Set()) {
  if (visited.has(table)) return false;
  const path = new Set([...visited, table]);
  const quoted = '"' + table.replaceAll('"', '""') + '"';
  const columns = db.prepare(`PRAGMA table_info(${quoted})`).all();
  if (!columns.some(c => c.name === 'workspace_id' && c.notnull)) return false;
  const groups = new Map();
  for (const fk of db.prepare(`PRAGMA foreign_key_list(${quoted})`).all()) {
    if (!groups.has(fk.id)) groups.set(fk.id, []);
    groups.get(fk.id).push(fk);
  }
  for (const fk of groups.values()) {
    if (!fk.every(edge => columns.some(c => c.name === edge.from && c.notnull))) continue;
    if (fk.length === 1 && fk[0].table === 'workspaces' && fk[0].from === 'workspace_id' && fk[0].to === 'id') return true;
    if (fk.some(edge => edge.from === 'workspace_id' && edge.to === 'workspace_id') && hasWorkspaceForeignKey(db, fk[0].table, path)) return true;
  }
  return false;
}
