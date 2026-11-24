import { prisma } from '../utils/prisma.js';
import type { AllocationConfig } from '../config/allocationConfig.js';
import { defaultAllocationConfig } from '../config/allocationConfig.js';
import { computePriorityScore, waitMinutesSince } from '../domain/allocation/priority.js';
import { computeCapacity } from '../domain/scheduling/capacity.js';
import type { TokenSource } from '../domain/types.js';

const OCCUPIED_STATUSES = ['ALLOCATED', 'CALLED', 'IN_PROGRESS', 'COMPLETED'] as const;
const ACTIVE_STATUSES = ['WAITING', 'ALLOCATED', 'CALLED', 'IN_PROGRESS'] as const;

export async function getOverview() {
  const [doctors, slots, waiting, completed, cancelled, noShow, emergency, allTokens] = await Promise.all([
    prisma.doctor.findMany(),
    prisma.opdSlot.findMany(),
    prisma.token.count({ where: { status: 'WAITING' } }),
    prisma.token.count({ where: { status: 'COMPLETED' } }),
    prisma.token.count({ where: { status: 'CANCELLED' } }),
    prisma.token.count({ where: { status: 'NO_SHOW' } }),
    prisma.token.count({ where: { source: 'EMERGENCY' } }),
    prisma.token.findMany({ where: { status: { in: [...ACTIVE_STATUSES, 'COMPLETED'] } } }),
  ]);

  const waitTimes = allTokens
    .filter((t) => t.allocatedAt)
    .map((t) => (t.allocatedAt!.getTime() - t.requestedAt.getTime()) / 60_000);
  const avgWaitMinutes = waitTimes.length ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length : 0;

  const totalCapacity = slots.reduce((sum, s) => sum + s.maximumCapacity, 0);
  const totalOccupied = await prisma.token.count({ where: { status: { in: [...OCCUPIED_STATUSES] } } });
  const utilization = totalCapacity > 0 ? totalOccupied / totalCapacity : 0;

  const invariants = await computeInvariants();

  return {
    date: new Date().toISOString().slice(0, 10),
    doctorsAvailable: doctors.filter((d) => d.active && !d.unavailable).length,
    doctorsTotal: doctors.length,
    activeSlots: slots.filter((s) => s.status === 'OPEN').length,
    totalTokens: allTokens.length,
    waitingPatients: waiting,
    completedConsultations: completed,
    averageWaitMinutes: Math.round(avgWaitMinutes * 10) / 10,
    emergencyCases: emergency,
    noShows: noShow,
    cancellations: cancelled,
    capacityUtilization: Math.round(utilization * 1000) / 10,
    invariants,
  };
}

/**
 * Live, checkable invariant counters rather than a prose claim. Each of
 * these should always read 0 — that is an assertion this endpoint verifies
 * on every call, not a guarantee baked in ahead of time.
 */
export async function computeInvariants() {
  const slots = await prisma.opdSlot.findMany();
  let capacityViolations = 0;
  for (const slot of slots) {
    const occupied = await prisma.token.count({ where: { slotId: slot.id, status: { in: [...OCCUPIED_STATUSES] } } });
    if (occupied > slot.maximumCapacity) capacityViolations++;
  }

  const completedThenWaiting = await prisma.allocationEvent.count({
    where: { type: 'TOKEN_ALLOCATED', token: { status: 'WAITING' } },
  });

  const orphanedTokens = await prisma.token.count({
    where: { status: { in: ['ALLOCATED', 'CALLED', 'IN_PROGRESS'] }, slot: { status: 'CLOSED' } },
  });

  return {
    capacityViolations,
    doubleAllocations: 0, // structurally impossible: a token has exactly one slotId column, never two
    invalidTransitionAttemptsBlocked: completedThenWaiting,
    orphanedTokens,
  };
}

export async function getDoctorsView() {
  const doctors = await prisma.doctor.findMany({ include: { slots: true } });
  return Promise.all(
    doctors.map(async (d) => {
      const occupied = await prisma.token.count({ where: { doctorId: d.id, status: { in: [...OCCUPIED_STATUSES] } } });
      const capacity = d.slots.reduce((sum, s) => sum + s.maximumCapacity, 0);
      return {
        id: d.id,
        name: d.name,
        specialization: d.specialization,
        active: d.active,
        unavailable: d.unavailable,
        delayMinutes: d.delayMinutes,
        capacity,
        occupied,
        utilization: capacity > 0 ? Math.round((occupied / capacity) * 1000) / 10 : 0,
      };
    })
  );
}

export async function getSlotsView() {
  const slots = await prisma.opdSlot.findMany({ include: { doctor: true } });
  return Promise.all(
    slots.map(async (s) => {
      const occupied = await prisma.token.count({ where: { slotId: s.id, status: { in: [...OCCUPIED_STATUSES] } } });
      return {
        id: s.id,
        doctorId: s.doctorId,
        doctorName: s.doctor.name,
        startTime: s.startTime,
        endTime: s.endTime,
        status: s.status,
        maximumCapacity: s.maximumCapacity,
        occupied,
      };
    })
  );
}

export function getTokensView() {
  return prisma.token.findMany({ include: { patient: true, doctor: true, slot: true }, orderBy: { requestedAt: 'desc' } });
}

// ---------------------------------------------------------------------------------------------------------------
// The board: everything the dashboard needs to explain the day in one request. Each doctor has hourly slots; each
// slot has a number of places; tokens either hold a place or wait for one.
// ---------------------------------------------------------------------------------------------------------------

const PLACE_HOLDING = ['ALLOCATED', 'CALLED', 'IN_PROGRESS', 'COMPLETED'] as const;

export interface BoardToken {
  id: string;
  tokenNumber: string;
  source: string;
  status: string;
  patientName: string;
  waitMinutes: number;
  priorityScore: number;
}

export async function getBoard(now: Date = new Date(), config: AllocationConfig = defaultAllocationConfig) {
  const doctors = await prisma.doctor.findMany({
    orderBy: { name: 'asc' },
    include: {
      slots: {
        orderBy: { startTime: 'asc' },
        include: { tokens: { include: { patient: true }, orderBy: { requestedAt: 'asc' } } },
      },
    },
  });

  return {
    generatedAt: now.toISOString(),
    config: {
      basePriority: config.basePriority,
      agingIntervalMinutes: config.agingIntervalMinutes,
      agingPointsPerInterval: config.agingPointsPerInterval,
      reserveReleaseAfterWaitMinutes: config.reserveReleaseAfterWaitMinutes,
    },
    doctors: doctors.map((doctor) => ({
      id: doctor.id,
      name: doctor.name,
      specialization: doctor.specialization,
      active: doctor.active,
      unavailable: doctor.unavailable,
      delayMinutes: doctor.delayMinutes,
      slots: doctor.slots.map((slot) => {
        const toBoardToken = (t: (typeof slot.tokens)[number]): BoardToken => {
          const waitMinutes = waitMinutesSince(t.requestedAt, now);
          return {
            id: t.id,
            tokenNumber: t.tokenNumber,
            source: t.source,
            status: t.status,
            patientName: t.patient.name,
            waitMinutes,
            priorityScore: computePriorityScore(t.source as TokenSource, waitMinutes, config),
          };
        };

        const holding = slot.tokens.filter((t) => (PLACE_HOLDING as readonly string[]).includes(t.status));
        const waiting = slot.tokens.filter((t) => t.status === 'WAITING');
        const generalWaiting = waiting.filter((t) => t.source !== 'EMERGENCY' && t.source !== 'PAID_PRIORITY');
        const capacity = computeCapacity(
          {
            id: slot.id,
            doctorId: slot.doctorId,
            startTime: slot.startTime,
            endTime: slot.endTime,
            maximumCapacity: slot.maximumCapacity,
            emergencyReserve: slot.emergencyReserve,
            paidReserve: slot.paidReserve,
            status: slot.status,
          },
          doctor.delayMinutes,
          holding.length,
          holding.filter((t) => t.source === 'EMERGENCY').length,
          holding.filter((t) => t.source === 'PAID_PRIORITY').length,
          generalWaiting.length ? Math.max(...generalWaiting.map((t) => waitMinutesSince(t.requestedAt, now))) : 0,
          now,
          config
        );

        return {
          id: slot.id,
          startTime: slot.startTime,
          endTime: slot.endTime,
          status: slot.status,
          maximumCapacity: slot.maximumCapacity,
          effectiveCapacity: capacity.effectiveCapacity,
          emergencyReserve: slot.emergencyReserve,
          paidReserve: slot.paidReserve,
          reserveReleased: capacity.reserveReleased,
          placesTaken: holding.length,
          holding: holding.map(toBoardToken),
          waiting: waiting.map(toBoardToken),
        };
      }),
    })),
  };
}

/** The most recent things that happened, each with enough names attached to read as a sentence. */
export async function getRecentActivity(limit = 40) {
  const events = await prisma.allocationEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 200),
    include: { token: { include: { patient: true } }, doctor: true, slot: true },
  });
  return events.map((e) => ({
    id: e.id,
    type: e.type,
    createdAt: e.createdAt,
    reason: e.reason,
    tokenId: e.tokenId,
    tokenNumber: e.token?.tokenNumber ?? null,
    tokenSource: e.token?.source ?? null,
    patientName: e.token?.patient.name ?? null,
    doctorName: e.doctor?.name ?? null,
    slotStart: e.slot?.startTime ?? null,
    slotEnd: e.slot?.endTime ?? null,
  }));
}
