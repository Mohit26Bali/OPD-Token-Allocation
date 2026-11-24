import { InvalidTransitionError } from '../errors.js';
import type { TokenStatus } from '../types.js';

/**
 * Legal token status transitions.
 *
 *   WAITING -> ALLOCATED -> CALLED -> IN_PROGRESS -> COMPLETED
 *
 * Exits:
 *   WAITING/ALLOCATED -> CANCELLED
 *   ALLOCATED/CALLED  -> NO_SHOW
 *   WAITING           -> REJECTED   (no capacity ever found at intake)
 *
 * Reallocation is NOT a status transition when a new slot is found: a
 * reallocated token keeps its current status (WAITING or ALLOCATED) and
 * only its slotId/doctorId change. This avoids introducing an ambiguous
 * "REALLOCATED" terminal-looking state.
 *
 * One explicit exception: ALLOCATED -> WAITING is legal ONLY as the
 * displacement fallback (an emergency, capacity reduction, or slot closure
 * displaced this token and no eligible destination slot existed). The
 * token is never dropped — it returns to WAITING and re-enters the front of
 * its priority tier on the next recalculation pass. See
 * domain/allocation/reallocation.ts and docs/algorithm.md.
 *
 * Terminal states (COMPLETED, CANCELLED, NO_SHOW, REJECTED) accept no
 * further transitions — they are immutable once reached.
 */
const TRANSITIONS: Record<TokenStatus, TokenStatus[]> = {
  WAITING: ['ALLOCATED', 'CANCELLED', 'REJECTED'],
  ALLOCATED: ['CALLED', 'CANCELLED', 'NO_SHOW', 'WAITING'],
  CALLED: ['IN_PROGRESS', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
  REJECTED: [],
};

export function canTransition(from: TokenStatus, to: TokenStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: TokenStatus, to: TokenStatus, tokenId: string): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(
      `Token ${tokenId} cannot transition from ${from} to ${to}. Legal transitions from ${from}: [${
        TRANSITIONS[from]?.join(', ') || 'none — terminal state'
      }].`
    );
  }
}

export function isTerminal(status: TokenStatus): boolean {
  return TRANSITIONS[status].length === 0;
}
