import type { AllocationConfig } from '../config/allocationConfig.js';
import { defaultAllocationConfig } from '../config/allocationConfig.js';
import { DomainError, NotFoundError } from '../domain/errors.js';
import * as doctorRepo from '../repositories/doctorRepository.js';
import * as slotRepo from '../repositories/slotRepository.js';
import * as tokenRepo from '../repositories/tokenRepository.js';
import * as eventRepo from '../repositories/eventRepository.js';
import { withSerializableTransaction, type TxClient } from '../utils/withTransaction.js';
import { recalculateSlot, displaceOneFromSlot } from './allocationService.js';
import type { SlotStatus } from '@prisma/client';

export function createSlot(data: {
  doctorId: string;
  date: Date;
  startTime: Date;
  endTime: Date;
  maximumCapacity: number;
  emergencyReserve?: number;
  paidReserve?: number;
}) {
  return withSerializableTransaction(async (tx) => {
    const doctor = await doctorRepo.findDoctorById(tx, data.doctorId);
    if (!doctor) throw new NotFoundError(`Doctor ${data.doctorId} not found`);
    if (!doctor.active) throw new DomainError(`${doctor.name} is not active, so hours cannot be added`, 'DOCTOR_NOT_AVAILABLE');

    // Two hours of the same doctor that overlap would double their capacity for the same minutes.
    const overlapping = await tx.opdSlot.findFirst({
      where: {
        doctorId: data.doctorId,
        status: { in: ['OPEN', 'PAUSED'] },
        startTime: { lt: data.endTime },
        endTime: { gt: data.startTime },
      },
    });
    if (overlapping) {
      throw new DomainError(`${doctor.name} already has an hour that overlaps this time (${overlapping.startTime.toISOString()} to ${overlapping.endTime.toISOString()})`, 'SLOT_OVERLAP');
    }
    return slotRepo.createSlot(tx, data);
  });
}

export function listSlots(filter: { doctorId?: string; date?: Date } = {}) {
  return withSerializableTransaction((tx) => slotRepo.listSlots(tx, filter));
}

export function getSlot(id: string) {
  return withSerializableTransaction((tx) => slotRepo.findSlotById(tx, id));
}

async function updateCapacityInTx(db: TxClient, slotId: string, newCapacity: number, now: Date, config: AllocationConfig) {
  const slot = await slotRepo.findSlotById(db, slotId);
  if (!slot) throw new NotFoundError(`Slot ${slotId} not found`);

  const previousCapacity = slot.maximumCapacity;
  await slotRepo.updateSlot(db, slotId, { maximumCapacity: newCapacity });
  await eventRepo.recordEvent(db, {
    type: 'SLOT_CAPACITY_CHANGED',
    slotId,
    doctorId: slot.doctorId,
    reason: `Slot ${slotId} capacity changed from ${previousCapacity} to ${newCapacity}.`,
    payload: { previousCapacity, newCapacity },
  });

  const occupied = await tokenRepo.listOccupiedForSlot(db, slotId);
  const excess = occupied.length - newCapacity;

  let displacedCount = 0;
  if (excess > 0) {
    for (let i = 0; i < excess; i++) {
      const result = await displaceOneFromSlot(
        db,
        slotId,
        now,
        config,
        `Slot capacity reduced from ${previousCapacity} to ${newCapacity}, exceeding occupied count`
      );
      if (!result) break;
      displacedCount++;
    }
  }

  const result = await recalculateSlot(db, slotId, now, config);
  return { slot: await slotRepo.findSlotById(db, slotId), displacedCount, ...result };
}

export function updateSlotCapacity(
  slotId: string,
  newCapacity: number,
  now: Date = new Date(),
  config: AllocationConfig = defaultAllocationConfig
) {
  return withSerializableTransaction((tx) => updateCapacityInTx(tx, slotId, newCapacity, now, config));
}

async function updateStatusInTx(db: TxClient, slotId: string, status: SlotStatus, now: Date, config: AllocationConfig) {
  const slot = await slotRepo.findSlotById(db, slotId);
  if (!slot) throw new NotFoundError(`Slot ${slotId} not found`);

  await slotRepo.updateSlot(db, slotId, { status });
  await eventRepo.recordEvent(db, {
    type: 'SLOT_CAPACITY_CHANGED',
    slotId,
    doctorId: slot.doctorId,
    reason: `Slot ${slotId} status changed from ${slot.status} to ${status}.`,
    payload: { previousStatus: slot.status, newStatus: status },
  });

  let displacedCount = 0;
  if (status === 'CLOSED' || status === 'PAUSED') {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const result = await displaceOneFromSlot(db, slotId, now, config, `Slot ${slotId} set to ${status}`);
      if (!result) break;
      displacedCount++;
    }
  }

  return { slot: await slotRepo.findSlotById(db, slotId), displacedCount };
}

export function updateSlotStatus(
  slotId: string,
  status: SlotStatus,
  now: Date = new Date(),
  config: AllocationConfig = defaultAllocationConfig
) {
  return withSerializableTransaction((tx) => updateStatusInTx(tx, slotId, status, now, config));
}

export function reallocateSlot(slotId: string, now: Date = new Date(), config: AllocationConfig = defaultAllocationConfig) {
  return withSerializableTransaction((tx) => recalculateSlot(tx, slotId, now, config));
}
