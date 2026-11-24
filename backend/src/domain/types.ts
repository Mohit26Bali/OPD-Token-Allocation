/**
 * Plain domain types used by the pure allocation engine. These intentionally
 * mirror (a subset of) the Prisma models but contain zero Prisma/Express
 * imports, so the engine in domain/allocation can be unit-tested with plain
 * objects and reused unchanged by both the API services and the simulation.
 */

export type TokenSource = 'ONLINE' | 'WALK_IN' | 'PAID_PRIORITY' | 'FOLLOW_UP' | 'EMERGENCY';

export type TokenStatus =
  | 'WAITING'
  | 'ALLOCATED'
  | 'CALLED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW'
  | 'REJECTED';

export type SlotStatus = 'OPEN' | 'PAUSED' | 'CLOSED' | 'COMPLETED';

export interface DoctorState {
  id: string;
  specialization: string;
  active: boolean;
  unavailable: boolean;
  delayMinutes: number;
}

export interface SlotState {
  id: string;
  doctorId: string;
  startTime: Date;
  endTime: Date;
  maximumCapacity: number;
  emergencyReserve: number;
  paidReserve: number;
  status: SlotStatus;
}

export interface TokenState {
  id: string;
  doctorId: string;
  slotId: string;
  source: TokenSource;
  status: TokenStatus;
  requestedAt: Date;
  preferredDoctorId?: string | null;
}

/** A single allocation/reallocation/rejection outcome for one token, always carrying a human-readable reason. */
export interface AllocationDecision {
  tokenId: string;
  outcome: 'ALLOCATED' | 'REALLOCATED' | 'REMAINS_WAITING' | 'REJECTED' | 'DISPLACED';
  slotId: string | null;
  previousSlotId?: string | null;
  priorityScore: number;
  waitMinutes: number;
  reason: string;
}

export interface CapacityBreakdown {
  baseCapacity: number;
  effectiveCapacity: number;
  occupiedCapacity: number;
  remainingCapacity: number;
  emergencyReserveRemaining: number;
  paidReserveRemaining: number;
  reserveReleased: boolean;
}
