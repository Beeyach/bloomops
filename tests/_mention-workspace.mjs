import assert from 'node:assert/strict';

// Shared real-constraint scenarios for SQLite and disposable native D1.
export async function verifyMentionWorkspace(binding) {
  let checks = 0;
  const run = (sql, ...args) => binding.prepare(sql).bind(...args).run();
  const rejects = async (sql, args = [], pattern = /FOREIGN KEY/) => {
    await assert.rejects(run(sql, ...args), pattern); checks++;
  };
  for (const ws of ['a', 'b']) {
    await run('INSERT INTO workspaces(id,name,slug) VALUES(?,?,?)', ws, ws, ws);
    await run('INSERT INTO user(id,name,email) VALUES(?,?,?)', ws, ws, ws+'@example.test');
    await run("INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(?,?,?,'owner','active')", 'm-'+ws, ws, ws);
    await run('INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES(?,?,?,?)', 'c-'+ws, ws, ws, ws);
    for (const suffix of ['1', '2']) {
      const id = ws+suffix;
      await run("INSERT INTO record_discussion_threads(id,workspace_id,parent_type,parent_id,client_id,author_membership_id,author_user_id,last_request_id) VALUES(?,?,'client',?,?,?,?,?)", id, ws, 'c-'+ws, 'c-'+ws, 'm-'+ws, ws, id);
      await run('INSERT INTO record_discussion_comments(id,workspace_id,thread_id,author_membership_id,author_user_id,body,creation_hash,last_request_id) VALUES(?,?,?,?,?,?,?,?)', id, ws, id, 'm-'+ws, ws, 'Synthetic constraint fixture', id, id);
    }
  }
  const insert = 'INSERT INTO record_discussion_mentions(workspace_id,thread_id,comment_id,membership_id,user_id) VALUES(?,?,?,?,?)';
  const valid = ['a', 'a1', 'a1', 'm-a', 'a'];
  for (const row of [
    ['missing', 'a1', 'a1', 'm-a', 'a'], ['b', 'a1', 'a1', 'm-b', 'b'],
    ['a', 'a1', 'b1', 'm-a', 'a'], ['a', 'a2', 'a1', 'm-a', 'a'],
    ['a', 'a1', 'a1', 'm-b', 'b'], ['a', 'a1', 'a1', 'm-a', 'missing'],
  ]) await rejects(insert, row);
  for (let i=0; i<valid.length; i++) {
    const row = [...valid]; row[i] = null;
    await rejects(insert, row, /NOT NULL/);
  }
  await run(insert, ...valid); checks++;
  await rejects(insert, valid, /UNIQUE/);
  await rejects("UPDATE record_discussion_mentions SET workspace_id='missing'");
  await rejects("UPDATE record_discussion_mentions SET membership_id='m-b'");
  await rejects("DELETE FROM record_discussion_comments WHERE id='a1'");
  await rejects("DELETE FROM workspace_memberships WHERE id='m-a'");
  const index = await binding.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='record_discussion_mentions_recipient_idx'").first();
  assert.ok(index); checks++;
  assert.equal((await binding.prepare('SELECT count(*) n FROM record_discussion_mentions').first()).n, 1); checks++;
  assert.deepEqual((await binding.prepare('PRAGMA foreign_key_check').all()).results, []); checks++;
  // Existing explicit cleanup order is preserved: mentions before comments.
  await run('DELETE FROM record_discussion_mentions');
  await run("DELETE FROM record_discussion_comments WHERE id='a1'"); checks++;
  return checks;
}
