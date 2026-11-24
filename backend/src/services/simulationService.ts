import { randomUUID } from 'node:crypto';
import { prisma } from '../utils/prisma.js';
import * as doctorRepo from '../repositories/doctorRepository.js';
import * as slotRepo from '../repositories/slotRepository.js';
import * as eventRepo from '../repositories/eventRepository.js';
import * as tokenService from './tokenService.js';
import * as emergencyService from './emergencyService.js';
import * as doctorService from './doctorService.js';
import * as slotService from './slotService.js';
import { demoDaySteps } from '../domain/simulation/demoDayScenario.js';
import { getDoctorsView } from './dashboardService.js';

interface SimulationRun {
  id: string;
  startedAt: string;
  finishedAt: string;
  timeline: Array<{ minuteOffset: number; simulatedTime: string; label: string; kind: string; detail?: string }>;
  metrics: {
    doctors: Array<{ name: string; specialization: string; capacity: number; occupied: number; utilizationPct: number }>;
    averageWaitMinutes: number;
    maxWaitMinutes: number;
    emergencyInsertions: number;
    reallocations: number;
    cancellations: number;
    noShows: number;
    rejectedOrHeldWaiting: number;
  };
}

const runs = new Map<string, SimulationRun>();

const DAY_START_HOUR = 8;
const DAY_START_MINUTE = 45;

function simulatedTime(minuteOffset: number): Date {
  const d = new Date();
  d.setHours(DAY_START_HOUR, DAY_START_MINUTE, 0, 0);
  return new Date(d.getTime() + minuteOffset * 60_000);
}

async function resetAndSeedDoctors() {
  await prisma.allocationEvent.deleteMany();
  await prisma.token.deleteMany();
  await prisma.opdSlot.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.doctor.deleteMany();

  const specs: Array<{ key: string; name: string; specialization: string }> = [
    { key: 'sharma', name: 'Dr. Sharma', specialization: 'Cardiology' },
    { key: 'patel', name: 'Dr. Patel', specialization: 'General Medicine' },
    { key: 'rao', name: 'Dr. Rao', specialization: 'Orthopedics' },
  ];

  const doctors: Record<string, { id: string }> = {};
  const slotsByDoctor: Record<string, string[]> = {};

  const base = simulatedTime(0);
  const dateOnly = new Date(base.toDateString());
  const windows: [number, number][] = [[9, 10], [10, 11], [11, 12], [12, 13]];

  for (const spec of specs) {
    const doctor = await doctorRepo.createDoctor(prisma, { name: spec.name, specialization: spec.specialization });
    doctors[spec.key] = doctor;
    slotsByDoctor[spec.key] = [];
    for (const [startHour, endHour] of windows) {
      const start = new Date(dateOnly);
      start.setHours(startHour, 0, 0, 0);
      const end = new Date(dateOnly);
      end.setHours(endHour, 0, 0, 0);
      const slot = await slotRepo.createSlot(prisma, {
        doctorId: doctor.id,
        date: dateOnly,
        startTime: start,
        endTime: end,
        maximumCapacity: 10,
        emergencyReserve: 1,
        paidReserve: 1,
      });
      slotsByDoctor[spec.key].push(slot.id);
    }
  }

  return { doctors, slotsByDoctor };
}

export async function runDemoDaySimulation(): Promise<SimulationRun> {
  const id = randomUUID();
  const startedAt = new Date().toISOString();
  const { doctors, slotsByDoctor } = await resetAndSeedDoctors();

  const tokenByKey: Record<string, string> = {};
  const timeline: SimulationRun['timeline'] = [];

  for (const step of demoDaySteps) {
    const now = simulatedTime(step.minuteOffset);
    let detail: string | undefined;

    switch (step.kind) {
      case 'NOTE': {
        break;
      }
      case 'CREATE_TOKEN': {
        const d = step.data as { doctorKey: string; slotIndex: number; source: any; patient: string };
        const doctorId = doctors[d.doctorKey].id;
        const slotId = slotsByDoctor[d.doctorKey][d.slotIndex];
        const token = await tokenService.createToken(
          { doctorId, slotId, source: d.source, patientName: d.patient },
          now
        );
        if (step.key && token) tokenByKey[step.key] = token.id;
        detail = token ? `Token ${token.tokenNumber} (${token.status})` : 'failed';
        break;
      }
      case 'CANCEL_TOKEN': {
        const tokenId = tokenByKey[step.refKey!];
        const token = await tokenService.cancelToken(tokenId, now);
        detail = token ? `Token ${token.tokenNumber} -> CANCELLED` : 'failed';
        break;
      }
      case 'NO_SHOW_TOKEN': {
        const tokenId = tokenByKey[step.refKey!];
        const token = await tokenService.noShowToken(tokenId, now);
        detail = token ? `Token ${token.tokenNumber} -> NO_SHOW` : 'failed';
        break;
      }
      case 'EMERGENCY': {
        const d = step.data as { doctorKey: string; slotIndex: number; patient: string; reason: string };
        const doctorId = doctors[d.doctorKey].id;
        const slotId = slotsByDoctor[d.doctorKey][d.slotIndex];
        const result = await emergencyService.insertEmergency(
          { doctorId, slotId, patientName: d.patient, reason: d.reason },
          now
        );
        detail = result.token
          ? `Emergency token ${result.token.tokenNumber} -> ${result.token.status}${result.displaced ? `, displaced token ${result.displaced.displacedTokenId}` : ''}`
          : 'failed';
        break;
      }
      case 'DELAY_DOCTOR': {
        const d = step.data as { doctorKey: string; delayMinutes: number };
        await doctorService.delayDoctor(doctors[d.doctorKey].id, d.delayMinutes, now);
        detail = `Delay applied: ${d.delayMinutes} min`;
        break;
      }
      case 'CAPACITY_CHANGE': {
        const d = step.data as { doctorKey: string; slotIndex: number; newCapacity: number };
        const slotId = slotsByDoctor[d.doctorKey][d.slotIndex];
        const result = await slotService.updateSlotCapacity(slotId, d.newCapacity, now);
        detail = `New capacity ${d.newCapacity}, displaced ${result.displacedCount}`;
        break;
      }
    }

    timeline.push({ minuteOffset: step.minuteOffset, simulatedTime: now.toISOString(), label: step.label, kind: step.kind, detail });
  }

  const doctorViews = await getDoctorsView();
  const allTokens = await prisma.token.findMany();
  const waitTimes = allTokens.filter((t) => t.allocatedAt).map((t) => (t.allocatedAt!.getTime() - t.requestedAt.getTime()) / 60_000);
  const events = await eventRepo.listRecentEvents(prisma, 500);

  const run: SimulationRun = {
    id,
    startedAt,
    finishedAt: new Date().toISOString(),
    timeline,
    metrics: {
      doctors: doctorViews.map((d) => ({
        name: d.name,
        specialization: d.specialization,
        capacity: d.capacity,
        occupied: d.occupied,
        utilizationPct: d.utilization,
      })),
      averageWaitMinutes: waitTimes.length ? Math.round((waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length) * 10) / 10 : 0,
      maxWaitMinutes: waitTimes.length ? Math.round(Math.max(...waitTimes) * 10) / 10 : 0,
      emergencyInsertions: events.filter((e) => e.type === 'EMERGENCY_INSERTED').length,
      reallocations: events.filter((e) => e.type === 'TOKEN_REALLOCATED').length,
      cancellations: events.filter((e) => e.type === 'TOKEN_CANCELLED').length,
      noShows: events.filter((e) => e.type === 'TOKEN_NO_SHOW').length,
      rejectedOrHeldWaiting: allTokens.filter((t) => t.status === 'WAITING' || t.status === 'REJECTED').length,
    },
  };

  runs.set(id, run);
  return run;
}

export function getSimulationRun(id: string): SimulationRun | undefined {
  return runs.get(id);
}
