import type { AllocationConfig } from '../config/allocationConfig.js';
import { defaultAllocationConfig } from '../config/allocationConfig.js';
import { allocateSlot } from '../domain/allocation/allocationEngine.js';
import { computeCapacity } from '../domain/scheduling/capacity.js';
import { selectDestinationSlot, selectDisplacementTarget } from '../domain/allocation/reallocation.js';
import { waitMinutesSince } from '../domain/allocation/priority.js';
import { CapacityExceededError, NotFoundError } from '../domain/errors.js';
import { toSlotState, toTokenState } from '../repositories/mappers.js';
import * as slotRepo from '../repositories/slotRepository.js';
import * as tokenRepo from '../repositories/tokenRepository.js';
import * as doctorRepo from '../repositories/doctorRepository.js';
import * as eventRepo from '../repositories/eventRepository.js';
import type { TxClient } from '../utils/withTransaction.js';

/**
 * Re-runs the allocation engine for one slot's currently WAITING tokens and
 * persists every decision as an update + AllocationEvent.
 *
 * This is the ONLY place that writes ALLOCATED status onto a token or moves
 * capacity around for a single slot — every trigger (creation, cancellation,
 * no-show, emergency, delay, capacity change) funnels through this function
 * so the persisted outcome always matches what the domain engine actually
 * decided, and every allocation carries the engine's own explanation.
 *
 * Only the affected slot's own WAITING tokens are touched — CALLED/
 * IN_PROGRESS/COMPLETED tokens anywhere are never read or written here.
 */
export async function recalculateSlot(
  db: TxClient,
  slotId: string,
  now: Date,
  config: AllocationConfig = defaultAllocationConfig
) {
  const slotRow = await slotRepo.findSlotById(db, slotId);
  if (!slotRow) throw new NotFoundError(`Slot ${slotId} not found`);
  if (slotRow.status !== 'OPEN') {
    return { capacity: null, decisions: [] };
  }

  const doctor = await doctorRepo.findDoctorById(db, slotRow.doctorId);
  if (!doctor) throw new NotFoundError(`Doctor ${slotRow.doctorId} not found`);

  const slot = toSlotState(slotRow);
  const occupiedRows = await tokenRepo.listOccupiedForSlot(db, slotId);
  const waitingRows = await tokenRepo.listWaitingForSlot(db, slotId);

  const { capacity, decisions } = allocateSlot({
    slot,
    delayMinutes: doctor.delayMinutes,
    occupiedTokens: occupiedRows.map(toTokenState),
    waitingTokens: waitingRows.map(toTokenState),
    now,
    config,
  });

  for (const decision of decisions) {
    if (decision.outcome === 'ALLOCATED') {
      await tokenRepo.updateToken(db, decision.tokenId, { status: 'ALLOCATED', slotId, allocatedAt: now });
      await eventRepo.recordEvent(db, {
        type: 'TOKEN_ALLOCATED',
        tokenId: decision.tokenId,
        slotId,
        doctorId: slot.doctorId,
        reason: decision.reason,
        payload: { priorityScore: decision.priorityScore, waitMinutes: decision.waitMinutes },
      });
    }
    // REMAINS_WAITING is not persisted as an event on its own — it produces
    // no state change. Its reason is still returned to the caller so API
    // responses (e.g. token creation) can explain "why still waiting" in
    // the same request without polluting the audit log with a non-event.
  }

  // Final invariant check before this transaction can commit: never exceed
  // effective capacity. This assertion is redundant with the engine's own
  // math but exists as a hard guard — if it ever fires it means a bug, and
  // it throws (aborting the transaction) rather than silently persisting
  // a violation.
  const finalOccupied = await tokenRepo.listOccupiedForSlot(db, slotId);
  if (finalOccupied.length > capacity.effectiveCapacity) {
    throw new CapacityExceededError(
      `Invariant violated for slot ${slotId}: occupied ${finalOccupied.length} > effective capacity ${capacity.effectiveCapacity}`
    );
  }

  return { capacity, decisions };
}

/**
 * Displaces the single lowest-priority ALLOCATED (not CALLED/IN_PROGRESS/
 * COMPLETED) token out of a slot, either moving it to an eligible
 * alternate slot or returning it to WAITING if none exists. Used by
 * emergency insertion, capacity reduction, and slot closure — every caller
 * supplies its own event type/reason so the audit trail explains *why* the
 * displacement happened in that specific context.
 *
 * Returns the displaced token's id, or null if the slot had no eligible
 * occupant to displace.
 */
export async function displaceOneFromSlot(
  db: TxClient,
  slotId: string,
  now: Date,
  config: AllocationConfig,
  reasonPrefix: string
): Promise<{ displacedTokenId: string; movedToSlotId: string | null } | null> {
  const slotRow = await slotRepo.findSlotById(db, slotId);
  if (!slotRow) throw new NotFoundError(`Slot ${slotId} not found`);
  const slot = toSlotState(slotRow);

  const occupiedRows = await tokenRepo.listOccupiedForSlot(db, slotId);
  const target = selectDisplacementTarget(occupiedRows.map(toTokenState), now, config);
  if (!target) return null;

  const doctor = await doctorRepo.findDoctorById(db, slotRow.doctorId);

  const sameDoctorAlternates = await slotRepo.listAlternateOpenSlotsForDoctor(db, slotRow.doctorId, slotId);
  const sameSpecAlternates = doctor
    ? await slotRepo.listAlternateOpenSlotsBySpecialization(db, doctor.specialization, slotRow.doctorId)
    : [];
  const candidateSlots = [...sameDoctorAlternates, ...sameSpecAlternates];

  const candidates = [];
  for (const candidateRow of candidateSlots) {
    const candidateDoctor = await doctorRepo.findDoctorById(db, candidateRow.doctorId);
    const occupied = await tokenRepo.listOccupiedForSlot(db, candidateRow.id);
    const candidateSlotState = toSlotState(candidateRow);
    const cap = computeCapacity(
      candidateSlotState,
      candidateDoctor?.delayMinutes ?? 0,
      occupied.length,
      occupied.filter((t) => t.source === 'EMERGENCY').length,
      occupied.filter((t) => t.source === 'PAID_PRIORITY').length,
      0,
      now,
      config
    );
    candidates.push({ slot: candidateSlotState, remainingCapacity: cap.remainingCapacity });
  }

  const destination = selectDestinationSlot(candidates, slot);

  if (destination) {
    await tokenRepo.updateToken(db, target.token.id, { slotId: destination.id, doctorId: destination.doctorId });
    await eventRepo.recordEvent(db, {
      type: 'TOKEN_REALLOCATED',
      tokenId: target.token.id,
      slotId: destination.id,
      doctorId: destination.doctorId,
      reason: `${reasonPrefix}. Displaced from slot ${slotId} (priority score ${target.priorityScore}); moved to alternate slot ${destination.id} starting ${destination.startTime.toISOString()} — closest-in-time eligible destination with available capacity.`,
      payload: { previousSlotId: slotId, priorityScore: target.priorityScore },
    });
    return { displacedTokenId: target.token.id, movedToSlotId: destination.id };
  }

  await tokenRepo.updateToken(db, target.token.id, { status: 'WAITING' });
  await eventRepo.recordEvent(db, {
    type: 'TOKEN_REALLOCATED',
    tokenId: target.token.id,
    slotId,
    doctorId: slot.doctorId,
    reason: `${reasonPrefix}. Displaced from slot ${slotId} (priority score ${target.priorityScore}); no eligible alternate slot had capacity, so the token was returned to WAITING at the front of its priority tier rather than dropped.`,
    payload: { previousSlotId: slotId, priorityScore: target.priorityScore },
  });
  return { displacedTokenId: target.token.id, movedToSlotId: null };
}

export function waitMinutesForToken(requestedAt: Date, now: Date): number {
  return waitMinutesSince(requestedAt, now);
}
