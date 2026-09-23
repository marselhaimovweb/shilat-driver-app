import { toMinutes, toTime } from './time';

export interface BusyBlock {
  startTime: string; // HH:MM
  durationMinutes: number;
}

export interface SlotInput {
  openTime: string;
  closeTime: string;
  intervalMinutes: number;
  durationMinutes: number;
  bays: number;
  busy: BusyBlock[];
  /** slots starting before this minute-of-day are not offered (used for "today") */
  earliestStartMinutes?: number;
}

export interface Slot {
  time: string;
  available: boolean;
  remaining: number;
}

/**
 * Builds the list of bookable start times for one day.
 * A slot is available when, at every minute of the wash, fewer than `bays`
 * other washes overlap it. The wash must also finish by closing time.
 */
export function computeSlots(input: SlotInput): Slot[] {
  const open = toMinutes(input.openTime);
  const close = toMinutes(input.closeTime);
  const blocks = input.busy.map((b) => {
    const start = toMinutes(b.startTime);
    return { start, end: start + b.durationMinutes };
  });
  const slots: Slot[] = [];
  const step = Math.max(5, input.intervalMinutes);

  for (let start = open; start + input.durationMinutes <= close; start += step) {
    const end = start + input.durationMinutes;
    // peak concurrency inside [start, end) is reached at the start of some block or at `start`
    const checkpoints = [start, ...blocks.filter((b) => b.start > start && b.start < end).map((b) => b.start)];
    let peak = 0;
    for (const point of checkpoints) {
      const overlapping = blocks.filter((b) => b.start <= point && b.end > point).length;
      peak = Math.max(peak, overlapping);
    }
    const remaining = Math.max(0, input.bays - peak);
    const tooEarly = input.earliestStartMinutes !== undefined && start < input.earliestStartMinutes;
    slots.push({ time: toTime(start), available: remaining > 0 && !tooEarly, remaining: tooEarly ? 0 : remaining });
  }
  return slots;
}
