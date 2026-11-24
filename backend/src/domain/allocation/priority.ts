import type { AllocationConfig } from '../../config/allocationConfig.js';
import type { TokenSource } from '../types.js';

/**
 * Priority score = base priority weight for the token's source + an aging
 * bonus for time spent waiting. Deliberately a plain two-term sum (not a
 * multi-factor weighted formula) so it stays explainable in one sentence:
 * "more urgent sources start higher, and everyone gains ground the longer
 * they wait." All constants are named and configurable — see
 * config/allocationConfig.ts and docs/algorithm.md for the rationale.
 */
export function computePriorityScore(source: TokenSource, waitMinutes: number, config: AllocationConfig): number {
  const base = config.basePriority[source] ?? 0;
  const agingBonus = Math.floor(waitMinutes / config.agingIntervalMinutes) * config.agingPointsPerInterval;
  return base + agingBonus;
}

export function waitMinutesSince(requestedAt: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - requestedAt.getTime()) / 60_000));
}
