import { test } from 'node:test';
import { freshSqlite, d1Binding } from './_bloomops-db.mjs';
import { verifyMentionWorkspace } from './_mention-workspace.mjs';

test('mention composite FKs enforce workspace, thread, membership, uniqueness and deletion invariants', async () => {
  const raw = freshSqlite();
  try { await verifyMentionWorkspace(d1Binding(raw)); }
  finally { raw.close(); }
});
