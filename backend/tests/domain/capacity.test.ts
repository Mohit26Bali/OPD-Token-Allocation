import { describe, expect, it } from 'vitest';
import { computeCapacity } from '../../src/domain/scheduling/capacity.js';
import { config, makeSlot, minutesAfter } from './fixtures.js';

describe('computeCapacity', () => {
  it('reports full remaining capacity when nothing is occupied and no delay', () => {
    const slot = makeSlot({ maximumCapacity: 10 });
    const now = slot.startTime;
    const c = computeCapacity(slot, 0, 0, 0, 0, 0, now, config);
    expect(c.baseCapacity).toBe(10);
    expect(c.effectiveCapacity).toBe(10);
    expect(c.remainingCapacity).toBe(10);
  });

  it('remaining capacity is exactly 1 when occupied is one below capacity', () => {
    const slot = makeSlot({ maximumCapacity: 10 });
    const c = computeCapacity(slot, 0, 9, 0, 0, 0, slot.startTime, config);
    expect(c.remainingCapacity).toBe(1);
  });

  it('remaining capacity is 0 when slot is exactly full', () => {
    const slot = makeSlot({ maximumCapacity: 10 });
    const c = computeCapacity(slot, 0, 10, 0, 0, 0, slot.startTime, config);
    expect(c.remainingCapacity).toBe(0);
  });

  it('remaining capacity floors at 0 and never negative even if occupied somehow exceeds base', () => {
    const slot = makeSlot({ maximumCapacity: 10 });
    const c = computeCapacity(slot, 0, 12, 0, 0, 0, slot.startTime, config);
    expect(c.remainingCapacity).toBe(0);
  });

  it('handles zero capacity slots', () => {
    const slot = makeSlot({ maximumCapacity: 0 });
    const c = computeCapacity(slot, 0, 0, 0, 0, 0, slot.startTime, config);
    expect(c.remainingCapacity).toBe(0);
    expect(c.effectiveCapacity).toBe(0);
  });

  it('reduces effective capacity under a delay, bounded above by base capacity', () => {
    const slot = makeSlot({ maximumCapacity: 10 });
    // 20 minute delay, avgConsultMinutes=10 -> remaining window shrinks
    const now = minutesAfter(slot.startTime, 20);
    const c = computeCapacity(slot, 20, 2, 0, 0, 0, now, config);
    expect(c.effectiveCapacity).toBeLessThanOrEqual(10);
    expect(c.effectiveCapacity).toBeGreaterThanOrEqual(2); // never revokes occupied
  });

  it('delay never reduces effective capacity below already-occupied count', () => {
    const slot = makeSlot({ maximumCapacity: 10, startTime: new Date('2026-08-09T09:00:00Z'), endTime: new Date('2026-08-09T09:10:00Z') });
    // Huge delay eating the entire remaining window, but 8 already occupied
    const now = minutesAfter(slot.startTime, 5);
    const c = computeCapacity(slot, 120, 8, 0, 0, 0, now, config);
    expect(c.effectiveCapacity).toBeGreaterThanOrEqual(8);
  });

  it('capacity increase (higher maximumCapacity) is reflected directly in remaining capacity', () => {
    const slot = makeSlot({ maximumCapacity: 15 });
    const c = computeCapacity(slot, 0, 10, 0, 0, 0, slot.startTime, config);
    expect(c.remainingCapacity).toBe(5);
  });

  it('capacity reduction below current occupied yields zero remaining, not negative', () => {
    const slot = makeSlot({ maximumCapacity: 5 });
    const c = computeCapacity(slot, 0, 8, 0, 0, 0, slot.startTime, config);
    expect(c.remainingCapacity).toBe(0);
  });

  it('marks reserve released once general waiting exceeds the aging threshold', () => {
    const slot = makeSlot();
    const c = computeCapacity(slot, 0, 0, 0, 0, config.reserveReleaseAfterWaitMinutes, slot.startTime, config);
    expect(c.reserveReleased).toBe(true);
  });

  it('keeps reserve held when general waiting is below the aging threshold', () => {
    const slot = makeSlot();
    const c = computeCapacity(slot, 0, 0, 0, 0, config.reserveReleaseAfterWaitMinutes - 1, slot.startTime, config);
    expect(c.reserveReleased).toBe(false);
  });
});
