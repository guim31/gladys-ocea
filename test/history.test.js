import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consumptionOf, monthKey, recordReading } from '../src/history.js';

const TZ = 'Europe/Paris';

test('monthKey follows the Gladys timezone', () => {
  // 31 Oct 23:30 UTC is already November in Paris.
  assert.equal(monthKey(new Date('2026-10-31T23:30:00Z'), TZ), '2026-11');
  assert.equal(monthKey(new Date('2026-10-31T23:30:00Z'), 'UTC'), '2026-10');
});

test('the first reading is the baseline: a partial month starts from it', () => {
  const entry = recordReading(undefined, 100, new Date('2026-10-13T08:00:00Z'), TZ);
  assert.equal(entry.baseline, 100);
  assert.equal(entry.baselineAt, '2026-10-13T08:00:00.000Z');
  assert.equal(consumptionOf(entry), 0);
  const later = recordReading(entry, 101.5, new Date('2026-10-20T08:00:00Z'), TZ);
  assert.equal(consumptionOf(later), 1.5);
  assert.equal(later.baselineAt, '2026-10-13T08:00:00.000Z');
});

test('a new month starts from the last index of the previous one', () => {
  let entry = recordReading(undefined, 100, new Date('2026-10-13T08:00:00Z'), TZ);
  entry = recordReading(entry, 104, new Date('2026-10-31T20:00:00Z'), TZ);
  entry = recordReading(entry, 104.5, new Date('2026-11-01T08:00:00Z'), TZ);
  assert.equal(entry.month, '2026-11');
  assert.equal(entry.baseline, 104);
  assert.equal(entry.baselineAt, '2026-10-31T20:00:00.000Z');
  assert.equal(consumptionOf(entry), 0.5);
});

test('an index going down never gives a negative consumption', () => {
  let entry = recordReading(undefined, 100, new Date('2026-10-01T08:00:00Z'), TZ);
  entry = recordReading(entry, 3, new Date('2026-10-02T08:00:00Z'), TZ);
  assert.equal(consumptionOf(entry), 3);
  assert.equal(consumptionOf(undefined), null);
});
