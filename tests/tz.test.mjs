import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tzToday, tzHour, tzShift, tzDaysBetween, tzParts, tzFormat } from '../lib/tz.mjs';

// A UTC instant that is a DIFFERENT calendar day in Pacific than in UTC or in
// Manila. 2026-08-04T06:00Z → Pacific (PDT, -7) = Aug 3, 23:00.
const laLateNight = new Date('2026-08-04T06:00:00Z');
// Winter instant to prove DST is handled: 2026-01-15T03:00Z → PST (-8) = Jan 14, 19:00.
const laWinter = new Date('2026-01-15T03:00:00Z');

test('tzToday reads the Pacific calendar day, not the machine or UTC day', () => {
  assert.equal(tzToday(laLateNight), '2026-08-03'); // still Aug 3 in California
  assert.equal(tzToday(laWinter), '2026-01-14');
});

test('tzHour returns the Pacific hour', () => {
  assert.equal(tzHour(laLateNight), 23);
  assert.equal(tzHour(laWinter), 19);
});

test('tzShift moves whole calendar days in Pacific', () => {
  assert.equal(tzShift(0, laLateNight), '2026-08-03');
  assert.equal(tzShift(1, laLateNight), '2026-08-04');
  assert.equal(tzShift(-1, laLateNight), '2026-08-02');
});

test('tzDaysBetween measures from the Pacific today, not the device', () => {
  assert.equal(tzDaysBetween('2026-08-03', laLateNight), 0);   // same Pacific day
  assert.equal(tzDaysBetween('2026-08-01', laLateNight), 2);
  assert.equal(tzDaysBetween('2026-08-05', laLateNight), -2);  // future
  assert.equal(tzDaysBetween(null, laLateNight), null);
  assert.equal(tzDaysBetween('not-a-date', laLateNight), null);
});

test('a date-only value is never rolled back a day by the tz conversion', () => {
  // The classic bug: Aug 1 (date-only) must read as Aug 1, not Jul 31.
  const parts = tzParts(new Date('2026-08-01T12:00:00Z'));
  assert.equal(parts.day, 1);
  // now = Aug 1, 11:00 Pacific; the stored Aug 1 reads as today (0), not -1.
  assert.equal(tzDaysBetween('2026-08-01', new Date('2026-08-01T18:00:00Z')), 0);
});

test('tzFormat renders a stored date in Pacific without a day-boundary slip', () => {
  assert.equal(tzFormat('2026-08-01', { month: 'short', day: 'numeric' }), 'Aug 1');
  assert.equal(tzFormat('', { month: 'short' }), '');
});
