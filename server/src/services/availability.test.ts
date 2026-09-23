import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSlots } from './availability';

const base = { openTime: '08:00', closeTime: '10:00', intervalMinutes: 30, durationMinutes: 30, bays: 2, busy: [] };

test('empty day offers every interval that fits before closing', () => {
  const slots = computeSlots(base);
  assert.deepEqual(slots.map((s) => s.time), ['08:00', '08:30', '09:00', '09:30']);
  assert.ok(slots.every((s) => s.available && s.remaining === 2));
});

test('long washes must finish by closing time', () => {
  const slots = computeSlots({ ...base, durationMinutes: 60 });
  assert.deepEqual(slots.map((s) => s.time), ['08:00', '08:30', '09:00']);
});

test('slot is full when all bays overlap', () => {
  const slots = computeSlots({
    ...base,
    busy: [
      { startTime: '08:00', durationMinutes: 60 },
      { startTime: '08:30', durationMinutes: 30 },
    ],
  });
  const byTime = Object.fromEntries(slots.map((s) => [s.time, s]));
  assert.equal(byTime['08:00'].remaining, 1);
  assert.equal(byTime['08:30'].available, false);
  assert.equal(byTime['09:00'].remaining, 2);
});

test('a 60 minute wash is blocked by a later overlap inside its window', () => {
  const slots = computeSlots({
    ...base,
    bays: 1,
    durationMinutes: 60,
    busy: [{ startTime: '08:30', durationMinutes: 30 }],
  });
  assert.equal(slots.find((s) => s.time === '08:00')?.available, false);
  assert.equal(slots.find((s) => s.time === '09:00')?.available, true);
});

test('earliest start hides past slots for today', () => {
  const slots = computeSlots({ ...base, earliestStartMinutes: 8 * 60 + 40 });
  assert.deepEqual(slots.filter((s) => s.available).map((s) => s.time), ['09:00', '09:30']);
});
