import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32, makeZip } from '../lib/zip.mjs';

test('crc32 matches known vectors', () => {
  const enc = (s) => new TextEncoder().encode(s);
  assert.equal(crc32(enc('')), 0);
  // Standard test vector for CRC-32/ISO-HDLC.
  assert.equal(crc32(enc('The quick brown fox jumps over the lazy dog')) >>> 0, 0x414fa339);
  assert.equal(crc32(enc('123456789')) >>> 0, 0xcbf43926);
});

test('makeZip produces a valid local file header and EOCD', () => {
  const zip = makeZip([{ name: 'a/SKILL.md', data: 'hello world' }]);
  const dv = new DataView(zip.buffer);
  // Local file header signature at start.
  assert.equal(dv.getUint32(0, true), 0x04034b50);
  // End-of-central-directory signature somewhere near the end.
  const eocd = dv.getUint32(zip.length - 22, true);
  assert.equal(eocd, 0x06054b50);
  // Entry count in EOCD.
  assert.equal(dv.getUint16(zip.length - 22 + 10, true), 1);
});

test('makeZip handles multiple files and counts them', () => {
  const zip = makeZip([
    { name: 'x/SKILL.md', data: 'one' },
    { name: 'y/SKILL.md', data: 'two' },
  ]);
  const dv = new DataView(zip.buffer);
  assert.equal(dv.getUint16(zip.length - 22 + 10, true), 2);
});
