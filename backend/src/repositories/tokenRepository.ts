import type { TokenSource, TokenStatus } from '@prisma/client';
import type { TxClient } from '../utils/withTransaction.js';

const OCCUPIED_STATUSES: TokenStatus[] = ['ALLOCATED', 'CALLED', 'IN_PROGRESS', 'COMPLETED'];

export function findTokenById(db: TxClient, id: string) {
  return db.token.findUnique({ where: { id }, include: { patient: true, doctor: true, slot: true } });
}

export function listTokens(
  db: TxClient,
  filter: { doctorId?: string; slotId?: string; status?: TokenStatus | TokenStatus[] } = {}
) {
  return db.token.findMany({
    where: {
      doctorId: filter.doctorId,
      slotId: filter.slotId,
      status: Array.isArray(filter.status) ? { in: filter.status } : filter.status,
    },
    include: { patient: true, doctor: true },
    orderBy: { requestedAt: 'asc' },
  });
}

export function listOccupiedForSlot(db: TxClient, slotId: string) {
  return db.token.findMany({ where: { slotId, status: { in: OCCUPIED_STATUSES } } });
}

export function listWaitingForSlot(db: TxClient, slotId: string) {
  return db.token.findMany({ where: { slotId, status: 'WAITING' }, orderBy: { requestedAt: 'asc' } });
}

export function listWaitingForDoctor(db: TxClient, doctorId: string) {
  return db.token.findMany({ where: { doctorId, status: 'WAITING' }, orderBy: { requestedAt: 'asc' } });
}

/**
 * The next free display number for a prefix (A, P, F, E): one more than the highest number already used with that prefix.
 * Counting rows instead hands out a number that already exists whenever numbers were not created strictly in order
 * (sample data, for example), and the duplicate then fails on the unique (slotId, tokenNumber) rule with a server error.
 */
export async function nextSequenceForPrefix(db: TxClient, prefix: string): Promise<number> {
  const rows = await db.token.findMany({ where: { tokenNumber: { startsWith: prefix } }, select: { tokenNumber: true } });
  let highest = 0;
  for (const { tokenNumber } of rows) {
    const n = Number.parseInt(tokenNumber.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > highest) highest = n;
  }
  return highest + 1;
}

export function countBySource(db: TxClient, source: TokenSource | TokenSource[]) {
  return db.token.count({ where: { source: Array.isArray(source) ? { in: source } : source } });
}

export function createToken(
  db: TxClient,
  data: {
    patientId: string;
    doctorId: string;
    slotId: string;
    tokenNumber: string;
    source: TokenSource;
    status: TokenStatus;
    priorityScoreAtIntake: number;
    requestedAt: Date;
    metadata?: object;
  }
) {
  return db.token.create({ data: { ...data, allocatedAt: data.status === 'ALLOCATED' ? data.requestedAt : undefined } });
}

export function updateToken(
  db: TxClient,
  id: string,
  data: Partial<{
    status: TokenStatus;
    slotId: string;
    doctorId: string;
    allocatedAt: Date | null;
    calledAt: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
    cancelledAt: Date | null;
    noShowAt: Date | null;
    displacedFromTokenId: string | null;
  }>
) {
  return db.token.update({ where: { id }, data });
}
