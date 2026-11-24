import type { AllocationConfig } from '../../config/allocationConfig.js';
import { computePriorityScore, waitMinutesSince } from './priority.js';
import type { SlotState, TokenState } from '../types.js';

/**
 * Selects the token to displace when an emergency exhausts a slot's
 * emergency reserve and general/paid capacity is also full.
 *
 * Only ALLOCATED tokens are eligible — CALLED/IN_PROGRESS/COMPLETED tokens
 * are never displaced (a patient already being seen, or on their way in,
 * is never bumped). Among eligible tokens, the one with the LOWEST current
 * priority score is displaced (least urgent claim on this slot). Ties break
 * by latest requestedAt (most recently arrived among equals moves first),
 * then token id for determinism.
 */
export function selectDisplacementTarget(
  occupiedTokens: TokenState[],
  now: Date,
  config: AllocationConfig
): { token: TokenState; priorityScore: number } | null {
  const eligible = occupiedTokens.filter((t) => t.status === 'ALLOCATED');
  if (eligible.length === 0) return null;

  const scored = eligible.map((token) => ({
    token,
    priorityScore: computePriorityScore(token.source, waitMinutesSince(token.requestedAt, now), config),
  }));

  scored.sort((a, b) => {
    if (a.priorityScore !== b.priorityScore) return a.priorityScore - b.priorityScore;
    if (b.token.requestedAt.getTime() !== a.token.requestedAt.getTime()) {
      return b.token.requestedAt.getTime() - a.token.requestedAt.getTime();
    }
    return a.token.id.localeCompare(b.token.id);
  });

  return scored[0];
}

export interface DestinationCandidate {
  slot: SlotState;
  remainingCapacity: number;
}

/**
 * Chooses a destination slot for a token that needs to move (displacement,
 * delay overflow, doctor unavailable). Candidates must already be filtered
 * by hard constraints upstream (doctor compatibility/specialization, OPEN
 * status) — this function only ranks among already-eligible options:
 *
 *   1. must have remainingCapacity > 0 (hard constraint, re-checked here)
 *   2. prefer the slot closest in start time to the token's original slot
 *      (minimizes unnecessary disruption / a "movement cost" tiebreak)
 *   3. tie-break by earliest start time
 *
 * Returns null if no eligible destination exists — callers must then leave
 * the token in WAITING and record why, never silently drop it.
 */
export function selectDestinationSlot(
  candidates: DestinationCandidate[],
  originalSlot: SlotState
): SlotState | null {
  const eligible = candidates.filter((c) => c.remainingCapacity > 0 && c.slot.id !== originalSlot.id);
  if (eligible.length === 0) return null;

  eligible.sort((a, b) => {
    const distA = Math.abs(a.slot.startTime.getTime() - originalSlot.startTime.getTime());
    const distB = Math.abs(b.slot.startTime.getTime() - originalSlot.startTime.getTime());
    if (distA !== distB) return distA - distB;
    return a.slot.startTime.getTime() - b.slot.startTime.getTime();
  });

  return eligible[0].slot;
}
