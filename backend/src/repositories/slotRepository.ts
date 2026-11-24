import type { SlotStatus } from '@prisma/client';
import type { TxClient } from '../utils/withTransaction.js';

export function findSlotById(db: TxClient, id: string) {
  return db.opdSlot.findUnique({ where: { id } });
}

export function listSlots(db: TxClient, filter: { doctorId?: string; date?: Date } = {}) {
  return db.opdSlot.findMany({
    where: {
      doctorId: filter.doctorId,
      date: filter.date,
    },
    orderBy: { startTime: 'asc' },
  });
}

/** All OPEN slots for a doctor other than the given slot — used as reallocation destination candidates. */
export function listAlternateOpenSlotsForDoctor(db: TxClient, doctorId: string, excludeSlotId: string) {
  return db.opdSlot.findMany({
    where: { doctorId, status: 'OPEN', id: { not: excludeSlotId } },
    orderBy: { startTime: 'asc' },
  });
}

/** OPEN slots across ALL doctors matching a specialization — used when a doctor becomes unavailable. */
export function listAlternateOpenSlotsBySpecialization(db: TxClient, specialization: string, excludeDoctorId: string) {
  return db.opdSlot.findMany({
    where: { status: 'OPEN', doctor: { specialization, id: { not: excludeDoctorId }, active: true, unavailable: false } },
    orderBy: { startTime: 'asc' },
  });
}

export function createSlot(
  db: TxClient,
  data: {
    doctorId: string;
    date: Date;
    startTime: Date;
    endTime: Date;
    maximumCapacity: number;
    emergencyReserve?: number;
    paidReserve?: number;
  }
) {
  return db.opdSlot.create({ data });
}

export function updateSlot(
  db: TxClient,
  id: string,
  data: Partial<{ maximumCapacity: number; status: SlotStatus; emergencyReserve: number; paidReserve: number }>
) {
  return db.opdSlot.update({ where: { id }, data });
}
