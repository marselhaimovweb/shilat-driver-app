import type { Slot } from '../api/types';
import { toMinutes, toTime } from './dates';

/** Same algorithm as server/src/services/availability.ts - used by the demo mode. */
export function computeSlots(input: {
  openTime: string;
  closeTime: string;
  intervalMinutes: number;
  durationMinutes: number;
  bays: number;
  busy: { startTime: string; durationMinutes: number }[];
  earliestStartMinutes?: number;
}): Slot[] {
  const open = toMinutes(input.openTime);
  const close = toMinutes(input.closeTime);
  const blocks = input.busy.map((b) => ({ start: toMinutes(b.startTime), end: toMinutes(b.startTime) + b.durationMinutes }));
  const slots: Slot[] = [];
  for (let start = open; start + input.durationMinutes <= close; start += Math.max(5, input.intervalMinutes)) {
    const end = start + input.durationMinutes;
    const points = [start, ...blocks.filter((b) => b.start > start && b.start < end).map((b) => b.start)];
    const peak = Math.max(0, ...points.map((p) => blocks.filter((b) => b.start <= p && b.end > p).length));
    const remaining = Math.max(0, input.bays - peak);
    const tooEarly = input.earliestStartMinutes !== undefined && start < input.earliestStartMinutes;
    slots.push({ time: toTime(start), available: remaining > 0 && !tooEarly, remaining: tooEarly ? 0 : remaining });
  }
  return slots;
}
