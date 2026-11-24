import type { AllocationConfig } from '../config/allocationConfig.js';
import { defaultAllocationConfig } from '../config/allocationConfig.js';
import { computePriorityScore } from '../domain/allocation/priority.js';
import { NotFoundError, DomainError } from '../domain/errors.js';
import * as slotRepo from '../repositories/slotRepository.js';
import * as tokenRepo from '../repositories/tokenRepository.js';
import * as patientRepo from '../repositories/patientRepository.js';
import * as eventRepo from '../repositories/eventRepository.js';
import { formatTokenNumber, tokenNumberPrefix } from '../utils/tokenNumber.js';
import { withSerializableTransaction, type TxClient } from '../utils/withTransaction.js';
import { recalculateSlot, displaceOneFromSlot } from './allocationService.js';

export interface InsertEmergencyInput {
  patientName: string;
  patientPhone?: string;
  doctorId: string;
  slotId?: string;
  reason: string;
}

async function insertEmergencyInTx(db: TxClient, input: InsertEmergencyInput, now: Date, config: AllocationConfig) {
  let targetSlot = input.slotId ? await slotRepo.findSlotById(db, input.slotId) : null;
  if (!targetSlot) {
    const openSlots = await slotRepo.listSlots(db, { doctorId: input.doctorId });
    targetSlot = openSlots.find((s) => s.status === 'OPEN') ?? null;
  }
  if (!targetSlot) throw new NotFoundError(`No open slot available for doctor ${input.doctorId}`);
  if (targetSlot.status !== 'OPEN') throw new DomainError(`Target slot ${targetSlot.id} is not OPEN`, 'SLOT_CLOSED');

  const patient = await patientRepo.createPatient(db, { name: input.patientName, phone: input.patientPhone });
  const sequence = await tokenRepo.nextSequenceForPrefix(db, tokenNumberPrefix('EMERGENCY'));
  const tokenNumber = formatTokenNumber('EMERGENCY', sequence);
  const priorityScoreAtIntake = computePriorityScore('EMERGENCY', 0, config);

  const token = await tokenRepo.createToken(db, {
    patientId: patient.id,
    doctorId: targetSlot.doctorId,
    slotId: targetSlot.id,
    tokenNumber,
    source: 'EMERGENCY',
    status: 'WAITING',
    priorityScoreAtIntake,
    requestedAt: now,
  });

  await eventRepo.recordEvent(db, {
    type: 'EMERGENCY_INSERTED',
    tokenId: token.id,
    slotId: targetSlot.id,
    doctorId: targetSlot.doctorId,
    reason: `Emergency token ${tokenNumber} requested for slot ${targetSlot.id}. Reason: ${input.reason}. Attempting emergency-reserved capacity first, then displacement if exhausted.`,
    payload: { reason: input.reason },
  });

  await recalculateSlot(db, targetSlot.id, now, config);

  let displaced: Awaited<ReturnType<typeof displaceOneFromSlot>> = null;
  let refreshed = await tokenRepo.findTokenById(db, token.id);

  if (refreshed?.status === 'WAITING') {
    displaced = await displaceOneFromSlot(
      db,
      targetSlot.id,
      now,
      config,
      `Emergency token ${tokenNumber} required capacity beyond the emergency reserve and general pool`
    );

    if (displaced) {
      await recalculateSlot(db, targetSlot.id, now, config);
      refreshed = await tokenRepo.findTokenById(db, token.id);
    } else {
      await eventRepo.recordEvent(db, {
        type: 'EMERGENCY_INSERTED',
        tokenId: token.id,
        slotId: targetSlot.id,
        doctorId: targetSlot.doctorId,
        reason: `Emergency token ${tokenNumber} could not be allocated: slot is at hard capacity with no ALLOCATED (not yet called) occupant eligible for displacement. Token remains WAITING and will be reconsidered on the next recalculation.`,
        payload: {},
      });
    }
  }

  return { token: refreshed, displaced };
}

export function insertEmergency(
  input: InsertEmergencyInput,
  now: Date = new Date(),
  config: AllocationConfig = defaultAllocationConfig
) {
  return withSerializableTransaction((tx) => insertEmergencyInTx(tx, input, now, config));
}
