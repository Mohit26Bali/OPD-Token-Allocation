import type { AllocationConfig } from '../../config/allocationConfig.js';
import type { CapacityBreakdown, SlotState } from '../types.js';

const MINUTE_MS = 60_000;

/**
 * Computes effective capacity for a slot at a point in time.
 *
 * effective capacity = min(base capacity, delay-adjusted achievable capacity)
 *
 * The delay-adjusted figure is a SCHEDULING APPROXIMATION for planning
 * purposes only ("how many more patients can plausibly be seen in the time
 * left, assuming an average consultation length") — it is NOT a clinical
 * throughput prediction. Real consultations vary in duration; this number
 * exists to bound how much capacity a delay can realistically absorb, not
 * to promise an exact count. See docs/algorithm.md.
 *
 * The bound never drops below `occupiedCapacity`: already-allocated
 * (ALLOCATED/CALLED/IN_PROGRESS/COMPLETED) tokens are never revoked by a
 * delay recalculation.
 */
export function computeCapacity(
  slot: SlotState,
  delayMinutes: number,
  occupiedCapacity: number,
  emergencyOccupied: number,
  paidOccupied: number,
  generalWaitingMaxWaitMinutes: number,
  now: Date,
  config: AllocationConfig
): CapacityBreakdown {
  const baseCapacity = slot.maximumCapacity;

  let effectiveCapacity = baseCapacity;

  if (delayMinutes > 0) {
    const effectiveStart = new Date(slot.startTime.getTime() + delayMinutes * MINUTE_MS);
    const clampedNow = now.getTime() > effectiveStart.getTime() ? now : effectiveStart;
    const remainingMs = slot.endTime.getTime() - clampedNow.getTime();
    const remainingMinutes = Math.max(0, Math.floor(remainingMs / MINUTE_MS));

    const achievableAdditional = Math.floor(remainingMinutes / config.avgConsultMinutes);
    const delayAdjustedCapacity = occupiedCapacity + achievableAdditional;
    effectiveCapacity = Math.min(baseCapacity, delayAdjustedCapacity);
    effectiveCapacity = Math.max(effectiveCapacity, occupiedCapacity);
  }

  const remainingCapacity = Math.max(0, effectiveCapacity - occupiedCapacity);

  const emergencyReserveRemaining = Math.max(0, slot.emergencyReserve - emergencyOccupied);
  const paidReserveRemaining = Math.max(0, slot.paidReserve - paidOccupied);
  const reserveReleased = generalWaitingMaxWaitMinutes >= config.reserveReleaseAfterWaitMinutes;

  return {
    baseCapacity,
    effectiveCapacity,
    occupiedCapacity,
    remainingCapacity,
    emergencyReserveRemaining,
    paidReserveRemaining,
    reserveReleased,
  };
}
