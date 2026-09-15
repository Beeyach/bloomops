// Synthetic malformed schemas only; never applied to the application database.
const root = 'CREATE TABLE workspaces(id TEXT PRIMARY KEY NOT NULL)';
const parent = 'CREATE TABLE parent(workspace_id TEXT NOT NULL REFERENCES workspaces(id), id TEXT NOT NULL)';
const child = 'CREATE TABLE child(workspace_id TEXT NOT NULL, parent_id TEXT NOT NULL, FOREIGN KEY(workspace_id,parent_id) REFERENCES parent(workspace_id,id))';
export const workspaceKeyCases = [
  { name: 'nonunique composite', ddl: [root, parent, child], valid: false },
  { name: 'partial unique composite', ddl: [root, parent, 'CREATE UNIQUE INDEX parent_key ON parent(workspace_id,id) WHERE id IS NOT NULL', child], valid: false },
  { name: 'separate unique columns', ddl: [root, parent, 'CREATE UNIQUE INDEX parent_ws ON parent(workspace_id)', 'CREATE UNIQUE INDEX parent_id ON parent(id)', child], valid: false },
  { name: 'expression unique index', ddl: [root, parent, 'CREATE UNIQUE INDEX parent_key ON parent(workspace_id,lower(id))', child], valid: false },
  { name: 'mismatched index collation', ddl: [root, parent, 'CREATE UNIQUE INDEX parent_key ON parent(workspace_id,id COLLATE NOCASE)', child], valid: false },
  { name: 'valid unique composite', ddl: [root, parent, 'CREATE UNIQUE INDEX parent_key ON parent(workspace_id,id)', child], valid: true },
  { name: 'valid reversed unique index', ddl: [root, parent, 'CREATE UNIQUE INDEX parent_key ON parent(id,workspace_id)', child], valid: true },
  { name: 'valid composite primary key', ddl: [root, parent.replace('id TEXT NOT NULL)', 'id TEXT NOT NULL, PRIMARY KEY(workspace_id,id))'), child], valid: true },
  ...[
    ['missing terminal table', null, false],
    ['missing terminal column', 'CREATE TABLE workspaces(other TEXT PRIMARY KEY NOT NULL)', false],
    ['nonunique terminal key', 'CREATE TABLE workspaces(id TEXT NOT NULL)', false],
    ['partial terminal key', 'CREATE TABLE workspaces(id TEXT NOT NULL)', false, 'CREATE UNIQUE INDEX root_key ON workspaces(id) WHERE id IS NOT NULL'],
    ['valid direct primary key', root, true],
    ['valid direct unique key', 'CREATE TABLE workspaces(id TEXT NOT NULL UNIQUE)', true],
    ['valid integer primary key', 'CREATE TABLE workspaces(id INTEGER PRIMARY KEY)', true],
  ].map(([name, table, valid, index]) => ({ name, valid, direct: true, ddl: [table, index, 'CREATE TABLE child(workspace_id TEXT NOT NULL REFERENCES workspaces(id))'].filter(Boolean) })),
];
export function representativeWrite(fixture) {
  // EXPLAIN is used by the checker, but this is a real DML attempt. No matching
  // parent is supplied: a valid FK reports a constraint failure, a broken one
  // reports mismatch/missing table instead. This also proves enforcement is on.
  return fixture.direct
    ? "INSERT INTO child(workspace_id) VALUES('missing-workspace')"
    : "INSERT INTO child(workspace_id,parent_id) VALUES('missing-workspace','missing-parent')";
}
export const keyWriteError = fixture => fixture.valid ? /FOREIGN KEY constraint failed/i : /foreign key mismatch|no such table/i;
