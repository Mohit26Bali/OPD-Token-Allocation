import { defaultAllocationConfig } from '../../src/config/allocationConfig.js';
import type { SlotState, TokenState, TokenSource, TokenStatus } from '../../src/domain/types.js';

export const config = defaultAllocationConfig;

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}${counter}`;
}

export function makeSlot(overrides: Partial<SlotState> = {}): SlotState {
  const base = new Date('2026-08-09T09:00:00Z');
  return {
    id: nextId('slot'),
    doctorId: 'doctor-1',
    startTime: base,
    endTime: new Date(base.getTime() + 60 * 60_000),
    maximumCapacity: 10,
    emergencyReserve: 1,
    paidReserve: 1,
    status: 'OPEN',
    ...overrides,
  };
}

export function makeToken(overrides: Partial<TokenState> = {}): TokenState {
  return {
    id: nextId('token'),
    doctorId: 'doctor-1',
    slotId: 'slot-1',
    source: 'WALK_IN',
    status: 'WAITING',
    requestedAt: new Date('2026-08-09T09:00:00Z'),
    ...overrides,
  };
}

export function minutesAfter(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60_000);
}

export const SOURCES: TokenSource[] = ['EMERGENCY', 'PAID_PRIORITY', 'FOLLOW_UP', 'ONLINE', 'WALK_IN'];
export const STATUSES: TokenStatus[] = [
  'WAITING',
  'ALLOCATED',
  'CALLED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
  'REJECTED',
];
