import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshSqlite, d1Binding } from './_bloomops-db.mjs';
import { verifyMentionWorkspace } from './_mention-workspace.mjs';

test('mention composite FKs enforce workspace, thread, membership, uniqueness and deletion invariants', async () => {
  const raw = freshSqlite();
  try { await verifyMentionWorkspace(d1Binding(raw)); }
  finally { raw.close(); }
});

test('mention deletion verifier detects an accidental recipient cascade', async () => {
  const raw = freshSqlite();
  try {
    const original = raw.prepare("SELECT sql FROM sqlite_master WHERE name='record_discussion_mentions'").get().sql;
    const memberFk = 'FOREIGN KEY (`workspace_id`,`membership_id`) REFERENCES `workspace_memberships`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action';
    assert.ok(original.includes(memberFk));
    // Mutate only this empty disposable database, never a migration or file.
    raw.exec('DROP TABLE record_discussion_mentions');
    raw.exec(original.replace(memberFk, memberFk.replace('DELETE no action', 'DELETE cascade')));
    raw.exec('CREATE INDEX record_discussion_mentions_recipient_idx ON record_discussion_mentions(workspace_id,membership_id,thread_id)');
    await assert.rejects(verifyMentionWorkspace(d1Binding(raw)), { code: 'ERR_ASSERTION', message: 'Missing expected rejection.' });
  } finally { raw.close(); }
});
