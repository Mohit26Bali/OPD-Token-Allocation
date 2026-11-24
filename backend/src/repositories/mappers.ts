import type { Doctor, OpdSlot, Token } from '@prisma/client';
import type { DoctorState, SlotState, TokenState } from '../domain/types.js';

export function toDoctorState(doctor: Doctor): DoctorState {
  return {
    id: doctor.id,
    specialization: doctor.specialization,
    active: doctor.active,
    unavailable: doctor.unavailable,
    delayMinutes: doctor.delayMinutes,
  };
}

export function toSlotState(slot: OpdSlot): SlotState {
  return {
    id: slot.id,
    doctorId: slot.doctorId,
    startTime: slot.startTime,
    endTime: slot.endTime,
    maximumCapacity: slot.maximumCapacity,
    emergencyReserve: slot.emergencyReserve,
    paidReserve: slot.paidReserve,
    status: slot.status,
  };
}

export function toTokenState(token: Token): TokenState {
  return {
    id: token.id,
    doctorId: token.doctorId,
    slotId: token.slotId,
    source: token.source,
    status: token.status,
    requestedAt: token.requestedAt,
    preferredDoctorId: token.preferredDoctorId,
  };
}
