// The wrong-header bug: thead maps over COLUMNS, but tbody is a hand-written
// sequence of col('key') gates — so a cell added or moved in one place and
// not the other puts data under the wrong header with no error anywhere.
// This test pins the two together by reading the component source: the
// ordered col('...') gates in the row markup must be exactly COLUMNS minus
// the always-visible name cell, in the same order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(
  fileURLToPath(new URL('../components/ProspectsApp.jsx', import.meta.url)),
  'utf-8'
);

function columnsKeys() {
  const m = src.match(/const COLUMNS = \[([\s\S]*?)\n\];/);
  assert.ok(m, 'COLUMNS array found');
  return [...m[1].matchAll(/key: '([^']+)'/g)].map((x) => x[1]);
}

function tbodyGateKeys() {
  // The row markup lives between the pageProspects map and the table close.
  const start = src.indexOf('pageProspects.map((p, rowIndex)');
  assert.ok(start !== -1, 'row map found');
  const region = src.slice(start, src.indexOf('</tbody>', start));
  return [...region.matchAll(/\{col\('([^']+)'\)/g)].map((x) => x[1]);
}

test('tbody cell order matches COLUMNS exactly', () => {
  const cols = columnsKeys();
  assert.equal(cols[0], 'name', 'name is the first, always-visible column');
  assert.deepEqual(
    tbodyGateKeys(),
    cols.slice(1),
    'every column after name renders in COLUMNS order — a mismatch here puts data under the wrong header'
  );
});

test('thead derives from the same COLUMNS list (no second header source)', () => {
  // The header must render by mapping visibleColumns (COLUMNS filtered),
  // never a parallel hand-written list.
  assert.match(src, /const visibleColumns = useMemo\(\s*\(\) => COLUMNS\.filter/);
  assert.match(src, /\{visibleColumns\.map\(\(c\) => \(\s*<th/);
});

// "Show in table" must survive a slow projection. The jump target may only be
// released once the row is actually in the DOM; a timer that lets go earlier
// is how the button silently did nothing on a tablet over 5,500 rows.
test('the jump to a row persists until the row exists, then flashes it', () => {
  assert.match(src, /const \[jumpId, setJumpId\] = useState\(null\)/);
  // openProspectRow clears filters, switches view, and hands over to the
  // effect — no self-expiring highlight at this stage.
  const open = src.slice(src.indexOf('function openProspectRow'), src.indexOf('function openProspectRow') + 900);
  assert.match(open, /clearFiltersForJump\(\)/);
  // The projection is tab-scoped and layout-scoped: without both of these the
  // person can be filtered clean out of the screen the button opens.
  assert.match(open, /setTab\(VIEW\.ALL\)/);
  assert.match(open, /\[VIEW\.ALL\]: 'table'/);
  assert.match(open, /setJumpId\(p\.id\)/);
  assert.ok(!/setTimeout/.test(open), 'no timer races the projection in the opener');
  // The effect pages first, scrolls when the ref exists, and only then lets go.
  const fx = src.slice(src.indexOf('if (!jumpId || view !== '));
  const effect = fx.slice(0, fx.indexOf('}, [jumpId'));
  assert.match(effect, /setPage\(target\)/);
  assert.match(effect, /scrollIntoView\(\{ block: 'center'/);
  assert.match(effect, /setJumpId\(null\)/);
});
