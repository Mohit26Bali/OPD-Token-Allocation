import { describe, expect, it } from 'vitest';
import { computePriorityScore } from '../../src/domain/allocation/priority.js';
import { config } from './fixtures.js';

describe('computePriorityScore', () => {
  it('ranks EMERGENCY above PAID_PRIORITY above FOLLOW_UP above ONLINE above WALK_IN at zero wait', () => {
    const scores = {
      EMERGENCY: computePriorityScore('EMERGENCY', 0, config),
      PAID_PRIORITY: computePriorityScore('PAID_PRIORITY', 0, config),
      FOLLOW_UP: computePriorityScore('FOLLOW_UP', 0, config),
      ONLINE: computePriorityScore('ONLINE', 0, config),
      WALK_IN: computePriorityScore('WALK_IN', 0, config),
    };
    expect(scores.EMERGENCY).toBeGreaterThan(scores.PAID_PRIORITY);
    expect(scores.PAID_PRIORITY).toBeGreaterThan(scores.FOLLOW_UP);
    expect(scores.FOLLOW_UP).toBeGreaterThan(scores.ONLINE);
    expect(scores.ONLINE).toBeGreaterThan(scores.WALK_IN);
  });

  it('applies aging bonus proportional to full waiting intervals only (floor behavior)', () => {
    const s0 = computePriorityScore('WALK_IN', 9, config); // < 10 min interval -> no bonus yet
    const s1 = computePriorityScore('WALK_IN', 10, config); // exactly one interval
    expect(s1).toBe(s0 + config.agingPointsPerInterval);
  });

  it('fairness: a long-waiting WALK_IN token can eventually out-score a freshly arrived FOLLOW_UP token', () => {
    const walkInGap = config.basePriority.FOLLOW_UP - config.basePriority.WALK_IN;
    const minutesNeeded = Math.ceil(walkInGap / config.agingPointsPerInterval) * config.agingIntervalMinutes;
    const agedWalkIn = computePriorityScore('WALK_IN', minutesNeeded, config);
    const freshFollowUp = computePriorityScore('FOLLOW_UP', 0, config);
    expect(agedWalkIn).toBeGreaterThanOrEqual(freshFollowUp);
  });

  it('high-priority arrivals do not permanently starve others: aging is unbounded and monotonic with wait time', () => {
    const shortWait = computePriorityScore('WALK_IN', 10, config);
    const longWait = computePriorityScore('WALK_IN', 1000, config);
    expect(longWait).toBeGreaterThan(shortWait);
  });
});
