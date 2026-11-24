import type { NextFunction, Request, Response } from 'express';
import { DomainError } from '../domain/errors.js';

const STATUS_BY_CODE: Record<string, number> = {
  VALIDATION: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID_TRANSITION: 409,
  CAPACITY_EXCEEDED: 409,
  SLOT_CLOSED: 409,
  INCOMPATIBLE_DOCTOR: 409,
  DOCTOR_SLOT_MISMATCH: 400,
  NO_SHOW_GRACE_PERIOD_ACTIVE: 409,
  DUPLICATE_TOKEN: 409,
  SLOT_OVERLAP: 409,
  DOCTOR_NOT_AVAILABLE: 409,
};

/** Wraps an async Express handler so rejected promises reach the error middleware instead of hanging the request. */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

function fail(res: Response, status: number, code: string, message: string) {
  res.status(status).json({ error: { code, message } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (err instanceof DomainError) {
    const status = STATUS_BY_CODE[err.code] ?? 400;
    fail(res, status, err.code, err.message);
    return;
  }

  // body-parser problems: malformed JSON, or a body over the size limit
  const parseType = (err as { type?: string })?.type;
  if (parseType === 'entity.parse.failed') return fail(res, 400, 'VALIDATION_ERROR', 'The request body is not valid JSON.');
  if (parseType === 'entity.too.large') return fail(res, 413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.');

  const prismaCode = (err as { code?: string })?.code;
  if (prismaCode === 'P2034' || prismaCode === 'P2002') {
    return fail(res, 409, 'CONFLICT', 'Someone else changed this at the same moment. Please try again.');
  }
  if (prismaCode === 'P2025') return fail(res, 404, 'NOT_FOUND', 'Resource not found.');
  if (prismaCode === 'P2003') return fail(res, 400, 'VALIDATION_ERROR', 'The request refers to something that does not exist.');

  // Never leak stack traces or internal details to the client.
  console.error(err);
  fail(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
}
