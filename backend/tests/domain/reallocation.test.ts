import { describe, expect, it } from 'vitest';
import { selectDestinationSlot, selectDisplacementTarget } from '../../src/domain/allocation/reallocation.js';
import { config, makeSlot, makeToken } from './fixtures.js';

describe('selectDisplacementTarget', () => {
  it('never selects a CALLED or IN_PROGRESS token', () => {
    const called = makeToken({ status: 'CALLED', source: 'WALK_IN' });
    const inProgress = makeToken({ status: 'IN_PROGRESS', source: 'WALK_IN' });
    const target = selectDisplacementTarget([called, inProgress], new Date('2026-08-09T09:00:00Z'), config);
    expect(target).toBeNull();
  });

  it('selects the lowest priority-score ALLOCATED token among occupants', () => {
    const now = new Date('2026-08-09T09:00:00Z');
    const highValue = makeToken({ status: 'ALLOCATED', source: 'PAID_PRIORITY', requestedAt: now });
    const lowValue = makeToken({ status: 'ALLOCATED', source: 'WALK_IN', requestedAt: now });
    const target = selectDisplacementTarget([highValue, lowValue], now, config);
    expect(target?.token.id).toBe(lowValue.id);
  });

  it('returns null when there are no eligible occupants at all', () => {
    const target = selectDisplacementTarget([], new Date(), config);
    expect(target).toBeNull();
  });
});

describe('selectDestinationSlot', () => {
  it('prefers the candidate slot closest in start time to the original', () => {
    const original = makeSlot({ startTime: new Date('2026-08-09T09:00:00Z') });
    const near = makeSlot({ startTime: new Date('2026-08-09T10:00:00Z') });
    const far = makeSlot({ startTime: new Date('2026-08-09T13:00:00Z') });
    const chosen = selectDestinationSlot(
      [
        { slot: far, remainingCapacity: 1 },
        { slot: near, remainingCapacity: 1 },
      ],
      original
    );
    expect(chosen?.id).toBe(near.id);
  });

  it('excludes candidates with zero remaining capacity', () => {
    const original = makeSlot({ startTime: new Date('2026-08-09T09:00:00Z') });
    const full = makeSlot({ startTime: new Date('2026-08-09T10:00:00Z') });
    const chosen = selectDestinationSlot([{ slot: full, remainingCapacity: 0 }], original);
    expect(chosen).toBeNull();
  });

  it('returns null when there is no eligible destination (no suitable capacity anywhere)', () => {
    const original = makeSlot();
    const chosen = selectDestinationSlot([], original);
    expect(chosen).toBeNull();
  });

  it('never returns the original slot itself as a destination', () => {
    const original = makeSlot({ startTime: new Date('2026-08-09T09:00:00Z') });
    const chosen = selectDestinationSlot([{ slot: original, remainingCapacity: 5 }], original);
    expect(chosen).toBeNull();
  });
});
