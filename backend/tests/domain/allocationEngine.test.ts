import { describe, expect, it } from 'vitest';
import { allocateSlot } from '../../src/domain/allocation/allocationEngine.js';
import { config, makeSlot, makeToken, minutesAfter } from './fixtures.js';

describe('allocateSlot', () => {
  it('allocates a waiting token when capacity is available', () => {
    const slot = makeSlot({ maximumCapacity: 10, emergencyReserve: 0, paidReserve: 0 });
    const token = makeToken({ source: 'WALK_IN' });
    const { decisions } = allocateSlot({
      slot,
      delayMinutes: 0,
      occupiedTokens: [],
      waitingTokens: [token],
      now: slot.startTime,
      config,
    });
    expect(decisions).toHaveLength(1);
    expect(decisions[0].outcome).toBe('ALLOCATED');
    expect(decisions[0].reason).toMatch(/general capacity pool/);
  });

  it('never exceeds hard capacity: only fills exactly the remaining slots', () => {
    const slot = makeSlot({ maximumCapacity: 3, emergencyReserve: 0, paidReserve: 0 });
    const occupied = [makeToken({ status: 'ALLOCATED' }), makeToken({ status: 'ALLOCATED' })];
    const waiting = [makeToken(), makeToken(), makeToken()];
    const { decisions, capacity } = allocateSlot({
      slot,
      delayMinutes: 0,
      occupiedTokens: occupied,
      waitingTokens: waiting,
      now: slot.startTime,
      config,
    });
    const allocatedCount = decisions.filter((d) => d.outcome === 'ALLOCATED').length;
    expect(allocatedCount).toBe(1); // only 1 remaining
    expect(capacity.occupiedCapacity + allocatedCount).toBeLessThanOrEqual(capacity.effectiveCapacity);
  });

  it('capacity zero: no tokens are ever allocated', () => {
    const slot = makeSlot({ maximumCapacity: 0 });
    const { decisions } = allocateSlot({
      slot,
      delayMinutes: 0,
      occupiedTokens: [],
      waitingTokens: [makeToken(), makeToken()],
      now: slot.startTime,
      config,
    });
    expect(decisions.every((d) => d.outcome === 'REMAINS_WAITING')).toBe(true);
  });

  it('prioritizes EMERGENCY over WALK_IN when capacity is scarce', () => {
    const slot = makeSlot({ maximumCapacity: 1, emergencyReserve: 0, paidReserve: 0 });
    const walkIn = makeToken({ source: 'WALK_IN', requestedAt: new Date('2026-08-09T08:00:00Z') });
    const emergency = makeToken({ source: 'EMERGENCY', requestedAt: new Date('2026-08-09T09:00:00Z') });
    const { decisions } = allocateSlot({
      slot,
      delayMinutes: 0,
      occupiedTokens: [],
      waitingTokens: [walkIn, emergency],
      now: slot.startTime,
      config,
    });
    const emergencyDecision = decisions.find((d) => d.tokenId === emergency.id)!;
    const walkInDecision = decisions.find((d) => d.tokenId === walkIn.id)!;
    expect(emergencyDecision.outcome).toBe('ALLOCATED');
    expect(walkInDecision.outcome).toBe('REMAINS_WAITING');
  });

  it('emergency reserve is used first for an emergency token even when general pool is full', () => {
    const slot = makeSlot({ maximumCapacity: 2, emergencyReserve: 1, paidReserve: 0 });
    const occupied = [makeToken({ status: 'ALLOCATED', source: 'WALK_IN' })];
    const emergency = makeToken({ source: 'EMERGENCY' });
    const { decisions } = allocateSlot({
      slot,
      delayMinutes: 0,
      occupiedTokens: occupied,
      waitingTokens: [emergency],
      now: slot.startTime,
      config,
    });
    expect(decisions[0].outcome).toBe('ALLOCATED');
    expect(decisions[0].reason).toMatch(/emergency reserved capacity/);
  });

  it('paid priority draws from paid reserve, not general pool, while both are available', () => {
    const slot = makeSlot({ maximumCapacity: 5, emergencyReserve: 1, paidReserve: 1 });
    const paid = makeToken({ source: 'PAID_PRIORITY' });
    const { decisions } = allocateSlot({
      slot,
      delayMinutes: 0,
      occupiedTokens: [],
      waitingTokens: [paid],
      now: slot.startTime,
      config,
    });
    expect(decisions[0].reason).toMatch(/paid-priority reserved capacity/);
  });

  it('online loses to walk-in when walk-in has aged enough to out-score it, demonstrating fairness', () => {
    const slot = makeSlot({ maximumCapacity: 1, emergencyReserve: 0, paidReserve: 0 });
    const gap = config.basePriority.ONLINE - config.basePriority.WALK_IN;
    const minutesNeeded = Math.ceil(gap / config.agingPointsPerInterval) * config.agingIntervalMinutes + config.agingIntervalMinutes;
    const now = minutesAfter(slot.startTime, minutesNeeded);
    const agedWalkIn = makeToken({ source: 'WALK_IN', requestedAt: slot.startTime });
    const freshOnline = makeToken({ source: 'ONLINE', requestedAt: now });
    const { decisions } = allocateSlot({
      slot,
      delayMinutes: 0,
      occupiedTokens: [],
      waitingTokens: [agedWalkIn, freshOnline],
      now,
      config,
    });
    expect(decisions.find((d) => d.tokenId === agedWalkIn.id)!.outcome).toBe('ALLOCATED');
  });

  it('is deterministic: identical input state produces identical decisions', () => {
    const slot = makeSlot({ maximumCapacity: 2, emergencyReserve: 0, paidReserve: 0 });
    const t1 = makeToken({ source: 'ONLINE', requestedAt: new Date('2026-08-09T09:00:00Z') });
    const t2 = makeToken({ source: 'WALK_IN', requestedAt: new Date('2026-08-09T09:05:00Z') });
    const t3 = makeToken({ source: 'FOLLOW_UP', requestedAt: new Date('2026-08-09T09:02:00Z') });
    const input = { slot, delayMinutes: 0, occupiedTokens: [], waitingTokens: [t1, t2, t3], now: slot.startTime, config };
    const run1 = allocateSlot(input);
    const run2 = allocateSlot(input);
    expect(run1.decisions.map((d) => [d.tokenId, d.outcome])).toEqual(run2.decisions.map((d) => [d.tokenId, d.outcome]));
  });

  it('reserved capacity releases to general pool once general tokens have aged past the threshold', () => {
    const slot = makeSlot({ maximumCapacity: 1, emergencyReserve: 1, paidReserve: 0 });
    const now = minutesAfter(slot.startTime, config.reserveReleaseAfterWaitMinutes);
    const walkIn = makeToken({ source: 'WALK_IN', requestedAt: slot.startTime });
    const { decisions } = allocateSlot({
      slot,
      delayMinutes: 0,
      occupiedTokens: [],
      waitingTokens: [walkIn],
      now,
      config,
    });
    expect(decisions[0].outcome).toBe('ALLOCATED');
    expect(decisions[0].reason).toMatch(/reserve merged into general pool/);
  });
});
