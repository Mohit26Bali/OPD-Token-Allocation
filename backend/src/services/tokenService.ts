import type { AllocationConfig } from '../config/allocationConfig.js';
import { defaultAllocationConfig } from '../config/allocationConfig.js';
import { computePriorityScore } from '../domain/allocation/priority.js';
import { assertTransition } from '../domain/tokens/stateMachine.js';
import { NotFoundError, SlotClosedError, DomainError } from '../domain/errors.js';
import * as slotRepo from '../repositories/slotRepository.js';
import * as doctorRepo from '../repositories/doctorRepository.js';
import * as tokenRepo from '../repositories/tokenRepository.js';
import * as patientRepo from '../repositories/patientRepository.js';
import * as eventRepo from '../repositories/eventRepository.js';
import { formatTokenNumber, tokenNumberPrefix } from '../utils/tokenNumber.js';
import { withSerializableTransaction, type TxClient } from '../utils/withTransaction.js';
import { recalculateSlot } from './allocationService.js';
import type { TokenSource } from '@prisma/client';

export interface CreateTokenInput {
  patientId?: string;
  patientName?: string;
  patientPhone?: string;
  doctorId: string;
  slotId: string;
  source: Exclude<TokenSource, 'EMERGENCY'>;
}

async function createTokenInTx(db: TxClient, input: CreateTokenInput, now: Date, config: AllocationConfig) {
  const slot = await slotRepo.findSlotById(db, input.slotId);
  if (!slot) throw new NotFoundError(`Slot ${input.slotId} not found`);
  if (slot.status !== 'OPEN') throw new SlotClosedError(`Slot ${input.slotId} is ${slot.status}, cannot accept new tokens`);
  if (slot.doctorId !== input.doctorId) throw new DomainError('Slot does not belong to the specified doctor', 'DOCTOR_SLOT_MISMATCH');

  const doctor = await doctorRepo.findDoctorById(db, input.doctorId);
  if (!doctor) throw new NotFoundError(`Doctor ${input.doctorId} not found`);
  if (!doctor.active || doctor.unavailable) {
    throw new DomainError(`${doctor.name} is not available, so no new tickets can be created for them`, 'DOCTOR_NOT_AVAILABLE');
  }

  let patientId = input.patientId;
  if (patientId && !(await patientRepo.findPatientById(db, patientId))) throw new NotFoundError(`Patient ${patientId} not found`);

  // One live ticket per patient per hour. A patient is the same person when the id matches, or (for walk-ins typed in at
  // the desk) when the name and phone number both match. Name alone is not enough: two different people can share a name.
  const sameSlotLive = { slotId: input.slotId, status: { in: ['WAITING', 'ALLOCATED', 'CALLED', 'IN_PROGRESS'] as Array<'WAITING' | 'ALLOCATED' | 'CALLED' | 'IN_PROGRESS'> } };
  const duplicate = patientId
    ? await db.token.findFirst({ where: { ...sameSlotLive, patientId } })
    : input.patientName && input.patientPhone
    ? await db.token.findFirst({ where: { ...sameSlotLive, patient: { name: { equals: input.patientName, mode: 'insensitive' }, phone: input.patientPhone } } })
    : null;
  if (duplicate) {
    throw new DomainError(`This patient already has ticket ${duplicate.tokenNumber} for this hour`, 'DUPLICATE_TOKEN');
  }

  if (!patientId) {
    if (!input.patientName) throw new DomainError('patientId or patientName is required', 'VALIDATION');
    const patient = await patientRepo.createPatient(db, { name: input.patientName, phone: input.patientPhone });
    patientId = patient.id;
  }

  const sequence = await tokenRepo.nextSequenceForPrefix(db, tokenNumberPrefix(input.source));
  const tokenNumber = formatTokenNumber(input.source, sequence);
  const priorityScoreAtIntake = computePriorityScore(input.source, 0, config);

  const token = await tokenRepo.createToken(db, {
    patientId,
    doctorId: input.doctorId,
    slotId: input.slotId,
    tokenNumber,
    source: input.source,
    status: 'WAITING',
    priorityScoreAtIntake,
    requestedAt: now,
  });

  await eventRepo.recordEvent(db, {
    type: 'TOKEN_CREATED',
    tokenId: token.id,
    slotId: input.slotId,
    doctorId: input.doctorId,
    reason: `Token ${tokenNumber} created for source ${input.source} (base priority ${priorityScoreAtIntake}); entered WAITING queue for slot ${input.slotId}.`,
    payload: { source: input.source, tokenNumber },
  });

  await recalculateSlot(db, input.slotId, now, config);

  return tokenRepo.findTokenById(db, token.id);
}

export function createToken(input: CreateTokenInput, now: Date = new Date(), config: AllocationConfig = defaultAllocationConfig) {
  return withSerializableTransaction((tx) => createTokenInTx(tx, input, now, config));
}

async function cancelTokenInTx(db: TxClient, tokenId: string, now: Date, config: AllocationConfig) {
  const token = await tokenRepo.findTokenById(db, tokenId);
  if (!token) throw new NotFoundError(`Token ${tokenId} not found`);

  assertTransition(token.status, 'CANCELLED', tokenId);
  const wasAllocated = token.status === 'ALLOCATED';
  const slotId = token.slotId;

  await tokenRepo.updateToken(db, tokenId, { status: 'CANCELLED', cancelledAt: now });
  await eventRepo.recordEvent(db, {
    type: 'TOKEN_CANCELLED',
    tokenId,
    slotId,
    doctorId: token.doctorId,
    reason: `Token ${token.tokenNumber} cancelled from status ${token.status}.${wasAllocated ? ' Freed 1 unit of capacity; triggering reallocation for this slot.' : ''}`,
    payload: { previousStatus: token.status },
  });

  if (wasAllocated) {
    await recalculateSlot(db, slotId, now, config);
  }

  return tokenRepo.findTokenById(db, tokenId);
}

export function cancelToken(tokenId: string, now: Date = new Date(), config: AllocationConfig = defaultAllocationConfig) {
  return withSerializableTransaction((tx) => cancelTokenInTx(tx, tokenId, now, config));
}

async function noShowTokenInTx(db: TxClient, tokenId: string, now: Date, config: AllocationConfig) {
  const token = await tokenRepo.findTokenById(db, tokenId);
  if (!token) throw new NotFoundError(`Token ${tokenId} not found`);

  assertTransition(token.status, 'NO_SHOW', tokenId);

  const graceDeadline = new Date(token.slot.startTime.getTime() + config.noShowGraceMinutes * 60_000);
  if (now.getTime() < graceDeadline.getTime()) {
    throw new DomainError(
      `Cannot mark no-show before the configured grace period elapses (grace ends ${graceDeadline.toISOString()}, now ${now.toISOString()}).`,
      'NO_SHOW_GRACE_PERIOD_ACTIVE'
    );
  }

  const slotId = token.slotId;
  await tokenRepo.updateToken(db, tokenId, { status: 'NO_SHOW', noShowAt: now });
  await eventRepo.recordEvent(db, {
    type: 'TOKEN_NO_SHOW',
    tokenId,
    slotId,
    doctorId: token.doctorId,
    reason: `Token ${token.tokenNumber} marked no-show after grace period (${config.noShowGraceMinutes} min) elapsed. Freed 1 unit of capacity; triggering reallocation.`,
    payload: { previousStatus: token.status },
  });

  await recalculateSlot(db, slotId, now, config);
  return tokenRepo.findTokenById(db, tokenId);
}

export function noShowToken(tokenId: string, now: Date = new Date(), config: AllocationConfig = defaultAllocationConfig) {
  return withSerializableTransaction((tx) => noShowTokenInTx(tx, tokenId, now, config));
}

async function simpleTransition(
  db: TxClient,
  tokenId: string,
  to: 'CALLED' | 'IN_PROGRESS' | 'COMPLETED',
  timestampField: 'calledAt' | 'startedAt' | 'completedAt',
  eventType: 'TOKEN_CALLED' | 'TOKEN_STARTED' | 'TOKEN_COMPLETED',
  now: Date
) {
  const token = await tokenRepo.findTokenById(db, tokenId);
  if (!token) throw new NotFoundError(`Token ${tokenId} not found`);
  assertTransition(token.status, to, tokenId);

  await tokenRepo.updateToken(db, tokenId, { status: to, [timestampField]: now });
  await eventRepo.recordEvent(db, {
    type: eventType,
    tokenId,
    slotId: token.slotId,
    doctorId: token.doctorId,
    reason: `Token ${token.tokenNumber} transitioned ${token.status} -> ${to}.`,
    payload: { previousStatus: token.status },
  });
  return tokenRepo.findTokenById(db, tokenId);
}

export function callToken(tokenId: string, now: Date = new Date()) {
  return withSerializableTransaction((tx) => simpleTransition(tx, tokenId, 'CALLED', 'calledAt', 'TOKEN_CALLED', now));
}

export function startToken(tokenId: string, now: Date = new Date()) {
  return withSerializableTransaction((tx) => simpleTransition(tx, tokenId, 'IN_PROGRESS', 'startedAt', 'TOKEN_STARTED', now));
}

export function completeToken(tokenId: string, now: Date = new Date()) {
  return withSerializableTransaction((tx) => simpleTransition(tx, tokenId, 'COMPLETED', 'completedAt', 'TOKEN_COMPLETED', now));
}
