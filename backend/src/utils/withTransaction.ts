import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from './prisma.js';
import { defaultAllocationConfig } from '../config/allocationConfig.js';

export type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

/**
 * Runs `fn` inside a PostgreSQL SERIALIZABLE transaction.
 *
 * Concurrency strategy (see docs/algorithm.md for full rationale): every
 * allocation-affecting operation (token creation, cancellation, no-show,
 * emergency insertion, reallocation, delay/capacity changes) runs inside a
 * Serializable transaction. Serializable isolation is NOT the same
 * mechanism as an explicit `SELECT ... FOR UPDATE` row lock — this wrapper
 * relies purely on Postgres's serializable-snapshot-isolation conflict
 * detection, and does not claim otherwise anywhere in the codebase or docs.
 *
 * When two concurrent transactions conflict (e.g. both try to allocate the
 * last unit of remaining capacity in a slot), Postgres aborts one of them
 * with SQLSTATE 40001, which Prisma surfaces as error code 'P2034'. This
 * wrapper catches that specific error and retries the whole transaction
 * (re-reading fresh state each time) up to `maxRetries` times before
 * surfacing the conflict to the caller as a 409.
 */
export async function withSerializableTransaction<T>(
  fn: (tx: TxClient) => Promise<T>,
  maxRetries: number = defaultAllocationConfig.maxTransactionRetries
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await prisma.$transaction(fn as any, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 10000,
      });
    } catch (err) {
      lastError = err;
      // P2034: two transactions conflicted. P2002: two creations picked the same display number at the same moment.
      // Both are safe to retry, because the whole transaction re-reads fresh state (and picks a new number).
      const isSerializationFailure =
        err instanceof Prisma.PrismaClientKnownRequestError && (err.code === 'P2034' || err.code === 'P2002');
      if (!isSerializationFailure) throw err;
      const backoffMs = 25 * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  throw lastError;
}
