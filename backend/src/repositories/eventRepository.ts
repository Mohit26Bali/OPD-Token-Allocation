import type { AllocationEventType } from '@prisma/client';
import type { TxClient } from '../utils/withTransaction.js';

export function recordEvent(
  db: TxClient,
  data: {
    type: AllocationEventType;
    tokenId?: string | null;
    slotId?: string | null;
    doctorId?: string | null;
    reason: string;
    payload?: object;
  }
) {
  return db.allocationEvent.create({
    data: {
      type: data.type,
      tokenId: data.tokenId ?? null,
      slotId: data.slotId ?? null,
      doctorId: data.doctorId ?? null,
      reason: data.reason,
      payload: data.payload ?? {},
    },
  });
}

export function listEventsForToken(db: TxClient, tokenId: string) {
  return db.allocationEvent.findMany({ where: { tokenId }, orderBy: { createdAt: 'asc' } });
}

export function listRecentEvents(db: TxClient, limit = 100) {
  return db.allocationEvent.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
}
