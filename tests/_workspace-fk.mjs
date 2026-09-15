const quote = name => '"' + name.replaceAll('"', '""') + '"';

function hasParentKey(db, fk) {
  const parent = quote(fk[0].table);
  const columns = db.prepare(`PRAGMA table_info(${parent})`).all();
  const target = fk.map(edge => edge.to);
  if (new Set(target).size !== target.length || !target.every(name => columns.some(c => c.name === name))) return false;
  // SQLite permits an index permutation of the referenced tuple. Compare the
  // complete key, never a prefix or a union of unrelated indexes. FK seq still
  // owns the child-to-parent mapping; it is never reordered to match an index.
  const matches = names => names.length === target.length && target.every(name => names.includes(name));
  const primary = columns.filter(c => c.pk).sort((a, b) => a.pk - b.pk).map(c => c.name);
  if (matches(primary)) return true;
  return db.prepare(`PRAGMA index_list(${parent})`).all().some(index => {
    if (!index.unique || index.partial) return false;
    const key = db.prepare(`PRAGMA index_xinfo(${quote(index.name)})`).all()
      .filter(c => c.key).sort((a, b) => a.seqno - b.seqno);
    return key.every(c => c.cid >= 0 && c.name !== null) && matches(key.map(c => c.name));
  });
}

// A non-null composite FK is an equally strong workspace anchor when every
// component is mandatory and the referenced workspace column is itself anchored.
// Never follow a nullable tuple (SQLite would allow it to bypass the FK), a
// renamed/unrelated workspace column, or a cycle with no workspaces root.
export function hasWorkspaceForeignKey(db, table, visited = new Set()) {
  if (visited.has(table)) return false;
  const path = new Set([...visited, table]);
  const quoted = quote(table);
  const columns = db.prepare(`PRAGMA table_info(${quoted})`).all();
  if (!columns.some(c => c.name === 'workspace_id' && c.notnull)) return false;
  // Ask SQLite to validate FK parent-key collations and other DML-only schema
  // errors without executing a write. PRAGMA metadata alone does not expose a
  // column's declared collation. Fail closed if enforcement is disabled or any
  // declared FK on this table is broken; EXPLAIN has no data side effects.
  if (!db.prepare('PRAGMA foreign_keys').get().foreign_keys) return false;
  try { db.prepare(`EXPLAIN INSERT INTO ${quoted} DEFAULT VALUES`); }
  catch { return false; }
  const groups = new Map();
  for (const fk of db.prepare(`PRAGMA foreign_key_list(${quoted})`).all()) {
    if (!groups.has(fk.id)) groups.set(fk.id, []);
    groups.get(fk.id).push(fk);
  }
  for (const group of groups.values()) {
    const fk = [...group].sort((a, b) => a.seq - b.seq);
    if (!hasParentKey(db, fk)) continue;
    if (!fk.every(edge => columns.some(c => c.name === edge.from && c.notnull))) continue;
    if (fk.length === 1 && fk[0].table === 'workspaces' && fk[0].from === 'workspace_id' && fk[0].to === 'id') return true;
    if (fk.some(edge => edge.from === 'workspace_id' && edge.to === 'workspace_id') && hasWorkspaceForeignKey(db, fk[0].table, path)) return true;
  }
  return false;
}
