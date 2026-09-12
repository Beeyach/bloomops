// Remote D1 /query parses trigger bodies differently from local SQLite.
// An unparenthesized CASE END can terminate a trigger prematurely (#4727):
// https://github.com/cloudflare/workers-sdk/issues/4727
// This narrow syntax guard supplements, rather than replaces, remote replay.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { unstable_splitSqlQuery as splitSqlQuery } from 'wrangler';

function assertRemoteTriggerCases(sql) {
  for (const statement of splitSqlQuery(sql)) {
    if (!/^CREATE\s+(?:TEMP(?:ORARY)?\s+)?TRIGGER\b/i.test(statement)) continue;
    let depth = 0;
    // Ignore strings, quoted identifiers and comments before counting SQL
    // parentheses. Parentheses in an error message cannot protect a CASE.
    const tokens = statement.match(/'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|--[^\n]*|\/\*[\s\S]*?\*\/|[()]|\bCASE\b/gi) ?? [];
    for (const token of tokens) {
      if (token === '(') depth++;
      else if (token === ')') depth--;
      else if (/^CASE$/i.test(token)) {
        assert.ok(depth > 0, `Parenthesize CASE expressions in remote D1 triggers: ${statement.split('\n')[0]}`);
      }
    }
  }
}

test('remote trigger guard detects CASE that local SQLite accepts', () => {
  const trigger = body => `CREATE TRIGGER guard BEFORE INSERT ON sample BEGIN ${body}; END;`;
  for (const body of [
    'SELECT CASE WHEN 1 THEN 1 ELSE 0 END',
    "SELECT RAISE(ABORT, '(CASE)') WHERE CASE WHEN 1 THEN 0 ELSE 1 END",
    "SELECT RAISE(ABORT, 'it''s (safe)') WHERE (CASE WHEN 1 THEN 0 END) OR case WHEN 1 THEN 0 END",
  ]) assert.throws(() => assertRemoteTriggerCases(trigger(body)), /Parenthesize CASE/);
  for (const body of [
    'SELECT (CASE WHEN 1 THEN 1 ELSE 0 END)',
    'SELECT 1 WHERE EXISTS (SELECT CASE WHEN 1 THEN 1 END)',
    "SELECT RAISE(ABORT, 'CASE') WHERE (CASE WHEN 1 THEN 0 END) OR (CASE WHEN 1 THEN 0 END)",
    'SELECT "CASE", `CASE`, [CASE] /* CASE ( */ -- CASE (\n WHERE (CASE WHEN 1 THEN 0 END)',
  ]) assert.doesNotThrow(() => assertRemoteTriggerCases(trigger(body)));
});

for (const name of readdirSync(new URL('../drizzle/', import.meta.url)).filter(name => name.endsWith('.sql')).sort()) {
  test(`domain migration ${name} uses remote-compatible trigger CASE expressions`, () => {
    assertRemoteTriggerCases(readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'));
  });
}
