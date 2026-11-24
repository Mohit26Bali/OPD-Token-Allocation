import type { AllocationConfig } from '../config/allocationConfig.js';
import { defaultAllocationConfig } from '../config/allocationConfig.js';
import { DomainError, NotFoundError } from '../domain/errors.js';
import * as doctorRepo from '../repositories/doctorRepository.js';
import * as slotRepo from '../repositories/slotRepository.js';
import * as tokenRepo from '../repositories/tokenRepository.js';
import * as eventRepo from '../repositories/eventRepository.js';
import { withSerializableTransaction, type TxClient } from '../utils/withTransaction.js';
import { recalculateSlot, displaceOneFromSlot } from './allocationService.js';

async function delayDoctorInTx(db: TxClient, doctorId: string, delayMinutes: number, now: Date, config: AllocationConfig) {
  const doctor = await doctorRepo.findDoctorById(db, doctorId);
  if (!doctor) throw new NotFoundError(`Doctor ${doctorId} not found`);
  if (!doctor.active) throw new DomainError(`${doctor.name} is not active`, 'DOCTOR_NOT_AVAILABLE');

  await doctorRepo.updateDoctor(db, doctorId, { delayMinutes, delayedAt: now });
  await eventRepo.recordEvent(db, {
    type: 'DOCTOR_DELAYED',
    doctorId,
    reason: `${doctor.name} delayed by ${delayMinutes} minutes at ${now.toISOString()}. Effective capacity for open slots recalculated as a scheduling approximation (min(base capacity, achievable capacity from remaining time)); already-occupied tokens are never revoked.`,
    payload: { delayMinutes },
  });

  const slots = await slotRepo.listSlots(db, { doctorId });
  const results = [];
  for (const slot of slots.filter((s) => s.status === 'OPEN')) {
    results.push(await recalculateSlot(db, slot.id, now, config));
  }
  return { doctor: await doctorRepo.findDoctorById(db, doctorId), recalculated: results.length };
}

export function delayDoctor(
  doctorId: string,
  delayMinutes: number,
  now: Date = new Date(),
  config: AllocationConfig = defaultAllocationConfig
) {
  return withSerializableTransaction((tx) => delayDoctorInTx(tx, doctorId, delayMinutes, now, config));
}

async function setUnavailableInTx(db: TxClient, doctorId: string, reason: string, now: Date, config: AllocationConfig) {
  const doctor = await doctorRepo.findDoctorById(db, doctorId);
  if (!doctor) throw new NotFoundError(`Doctor ${doctorId} not found`);

  await doctorRepo.updateDoctor(db, doctorId, { unavailable: true });
  await eventRepo.recordEvent(db, {
    type: 'DOCTOR_AVAILABILITY_CHANGED',
    doctorId,
    reason: `${doctor.name} marked unavailable. Reason: ${reason}. Open slots will be closed; ALLOCATED (not yet called) and WAITING patients will be reallocated to a compatible doctor (same specialization) where capacity exists, otherwise left waiting. CALLED/IN_PROGRESS/COMPLETED patients are never moved.`,
    payload: { reason },
  });

  const slots = await slotRepo.listSlots(db, { doctorId });
  let reallocatedCount = 0;
  let heldWaitingCount = 0;

  for (const slot of slots.filter((s) => s.status === 'OPEN')) {
    await slotRepo.updateSlot(db, slot.id, { status: 'CLOSED' });
    await eventRepo.recordEvent(db, {
      type: 'SLOT_CAPACITY_CHANGED',
      slotId: slot.id,
      doctorId,
      reason: `Slot ${slot.id} closed because doctor ${doctor.name} became unavailable.`,
      payload: { newStatus: 'CLOSED' },
    });

    // Displace every ALLOCATED-but-not-yet-called occupant (CALLED/IN_PROGRESS/COMPLETED untouched).
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const displaced = await displaceOneFromSlot(
        db,
        slot.id,
        now,
        config,
        `Doctor ${doctor.name} unavailable`
      );
      if (!displaced) break;
      if (displaced.movedToSlotId) reallocatedCount++;
      else heldWaitingCount++;
    }

    // Any still-WAITING tokens tied to this now-closed slot: try the same displacement path
    // (it treats WAITING-with-no-destination as already handled — here we just attempt to move them).
    const waiting = await tokenRepo.listWaitingForSlot(db, slot.id);
    for (const w of waiting) {
      const sameSpecAlternates = await slotRepo.listAlternateOpenSlotsBySpecialization(db, doctor.specialization, doctorId);
      const openAlternate = sameSpecAlternates[0];
      if (openAlternate) {
        await tokenRepo.updateToken(db, w.id, { slotId: openAlternate.id, doctorId: openAlternate.doctorId });
        await eventRepo.recordEvent(db, {
          type: 'TOKEN_REALLOCATED',
          tokenId: w.id,
          slotId: openAlternate.id,
          doctorId: openAlternate.doctorId,
          reason: `Token was WAITING on a slot closed due to doctor unavailability; moved to compatible open slot ${openAlternate.id}.`,
          payload: { previousSlotId: slot.id },
        });
        await recalculateSlot(db, openAlternate.id, now, config);
        reallocatedCount++;
      } else {
        heldWaitingCount++;
      }
    }
  }

  return { doctor: await doctorRepo.findDoctorById(db, doctorId), reallocatedCount, heldWaitingCount };
}

export function setDoctorUnavailable(
  doctorId: string,
  reason: string,
  now: Date = new Date(),
  config: AllocationConfig = defaultAllocationConfig
) {
  return withSerializableTransaction((tx) => setUnavailableInTx(tx, doctorId, reason, now, config));
}

async function setAvailableInTx(db: TxClient, doctorId: string, now: Date) {
  const doctor = await doctorRepo.findDoctorById(db, doctorId);
  if (!doctor) throw new NotFoundError(`Doctor ${doctorId} not found`);

  await doctorRepo.updateDoctor(db, doctorId, { unavailable: false, delayMinutes: 0, delayedAt: null });
  await eventRepo.recordEvent(db, {
    type: 'DOCTOR_AVAILABILITY_CHANGED',
    doctorId,
    reason: `${doctor.name} marked available again at ${now.toISOString()}. Delay cleared. Slots remain CLOSED until manually reopened (closure is a deliberate operational decision, not silently reversed).`,
    payload: {},
  });
  return doctorRepo.findDoctorById(db, doctorId);
}

export function setDoctorAvailable(doctorId: string, now: Date = new Date()) {
  return withSerializableTransaction((tx) => setAvailableInTx(tx, doctorId, now));
}
