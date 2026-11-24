import type { AllocationConfig } from '../../config/allocationConfig.js';
import { computeCapacity } from '../scheduling/capacity.js';
import type { AllocationDecision, CapacityBreakdown, SlotState, TokenState } from '../types.js';
import { computePriorityScore, waitMinutesSince } from './priority.js';

export interface AllocateSlotInput {
  slot: SlotState;
  delayMinutes: number;
  /** Tokens already occupying the slot: ALLOCATED/CALLED/IN_PROGRESS/COMPLETED. Never displaced by this function. */
  occupiedTokens: TokenState[];
  /** WAITING tokens eligible for this slot (already filtered upstream for doctor compatibility). */
  waitingTokens: TokenState[];
  now: Date;
  config: AllocationConfig;
}

export interface AllocateSlotResult {
  capacity: CapacityBreakdown;
  decisions: AllocationDecision[];
}

type Pool = 'emergency' | 'paid' | 'general';

/**
 * Fills a slot's remaining capacity from a set of waiting tokens.
 *
 * This function NEVER touches occupiedTokens (already-allocated/called/
 * in-progress/completed tokens are untouched) and never exceeds
 * capacity.effectiveCapacity. It is pure: same inputs always produce the
 * same decisions (deterministic sort, no randomness, no wall-clock reads
 * beyond the passed-in `now`).
 */
export function allocateSlot(input: AllocateSlotInput): AllocateSlotResult {
  const { slot, delayMinutes, occupiedTokens, waitingTokens, now, config } = input;

  const occupiedCapacity = occupiedTokens.length;
  const emergencyOccupied = occupiedTokens.filter((t) => t.source === 'EMERGENCY').length;
  const paidOccupied = occupiedTokens.filter((t) => t.source === 'PAID_PRIORITY').length;

  const generalWaiting = waitingTokens.filter((t) => t.source !== 'EMERGENCY' && t.source !== 'PAID_PRIORITY');
  const generalWaitingMaxWaitMinutes = generalWaiting.length
    ? Math.max(...generalWaiting.map((t) => waitMinutesSince(t.requestedAt, now)))
    : 0;

  const capacity = computeCapacity(
    slot,
    delayMinutes,
    occupiedCapacity,
    emergencyOccupied,
    paidOccupied,
    generalWaitingMaxWaitMinutes,
    now,
    config
  );

  const pools: Record<Pool, number> = {
    emergency: capacity.emergencyReserveRemaining,
    paid: capacity.paidReserveRemaining,
    general: capacity.reserveReleased
      ? capacity.remainingCapacity
      : Math.max(0, capacity.remainingCapacity - capacity.emergencyReserveRemaining - capacity.paidReserveRemaining),
  };

  const scored = waitingTokens.map((token) => {
    const waitMinutes = waitMinutesSince(token.requestedAt, now);
    const priorityScore = computePriorityScore(token.source, waitMinutes, config);
    return { token, waitMinutes, priorityScore };
  });

  scored.sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    if (a.token.requestedAt.getTime() !== b.token.requestedAt.getTime()) {
      return a.token.requestedAt.getTime() - b.token.requestedAt.getTime();
    }
    return a.token.id.localeCompare(b.token.id);
  });

  const decisions: AllocationDecision[] = [];

  for (const { token, waitMinutes, priorityScore } of scored) {
    const poolOrder: Pool[] =
      token.source === 'EMERGENCY'
        ? ['emergency', 'general']
        : token.source === 'PAID_PRIORITY'
        ? ['paid', 'general']
        : capacity.reserveReleased
        ? ['general', 'emergency', 'paid']
        : ['general'];

    const drawnFrom = poolOrder.find((p) => pools[p] > 0);

    if (drawnFrom) {
      pools[drawnFrom] -= 1;
      decisions.push({
        tokenId: token.id,
        outcome: 'ALLOCATED',
        slotId: slot.id,
        priorityScore,
        waitMinutes,
        reason: buildAllocatedReason(token, drawnFrom, priorityScore, waitMinutes, capacity),
      });
    } else {
      decisions.push({
        tokenId: token.id,
        outcome: 'REMAINS_WAITING',
        slotId: null,
        priorityScore,
        waitMinutes,
        reason: `No eligible capacity: general pool=${pools.general}, emergency reserve=${pools.emergency}, paid reserve=${pools.paid}, effective capacity=${capacity.effectiveCapacity}, occupied=${capacity.occupiedCapacity}.`,
      });
    }
  }

  return { capacity, decisions };
}

function buildAllocatedReason(
  token: TokenState,
  pool: Pool,
  priorityScore: number,
  waitMinutes: number,
  capacity: CapacityBreakdown
): string {
  const poolLabel =
    pool === 'emergency'
      ? 'emergency reserved capacity'
      : pool === 'paid'
      ? 'paid-priority reserved capacity'
      : 'general capacity pool';
  const releaseNote = capacity.reserveReleased && pool === 'general' ? ' (reserve merged into general pool after aging threshold)' : '';
  return `Allocated from ${poolLabel}${releaseNote}. Source=${token.source}, priority score=${priorityScore} (waited ${waitMinutes} min), effective capacity=${capacity.effectiveCapacity}, occupied before=${capacity.occupiedCapacity}.`;
}
