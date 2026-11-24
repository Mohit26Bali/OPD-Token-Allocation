/**
 * All tunable allocation policy constants live here so the algorithm in
 * domain/allocation stays free of magic numbers and every threshold is
 * documented in one place (see docs/algorithm.md for the rationale).
 */
export interface AllocationConfig {
  /** Base priority weight per token source. Higher = more urgent. */
  basePriority: Record<string, number>;
  /** Priority-score points added per `agingIntervalMinutes` a token has waited. */
  agingPointsPerInterval: number;
  agingIntervalMinutes: number;
  /**
   * Waiting minutes a general-pool token must accrue before it becomes
   * eligible to consume unused EMERGENCY/PAID_PRIORITY reserved capacity.
   */
  reserveReleaseAfterWaitMinutes: number;
  /** No-show grace period after a token's slot start before auto no-show is allowed. */
  noShowGraceMinutes: number;
  /** Assumed average consultation length, used only for delay-based effective-capacity estimation. */
  avgConsultMinutes: number;
  /** Max Postgres serialization-failure retries for allocation-affecting transactions. */
  maxTransactionRetries: number;
}

export const defaultAllocationConfig: AllocationConfig = {
  basePriority: {
    EMERGENCY: 100,
    PAID_PRIORITY: 80,
    FOLLOW_UP: 60,
    ONLINE: 40,
    WALK_IN: 20,
  },
  agingPointsPerInterval: 1,
  agingIntervalMinutes: 10,
  reserveReleaseAfterWaitMinutes: 30,
  noShowGraceMinutes: 10,
  avgConsultMinutes: 10,
  maxTransactionRetries: 3,
};
