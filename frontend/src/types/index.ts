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

export interface Doctor {
  id: string;
  name: string;
  specialization: string;
  active: boolean;
  unavailable: boolean;
  delayMinutes: number;
  createdAt: string;
}

export interface Slot {
  id: string;
  doctorId: string;
  date: string;
  startTime: string;
  endTime: string;
  maximumCapacity: number;
  emergencyReserve: number;
  paidReserve: number;
  status: SlotStatus;
}

export interface Patient {
  id: string;
  name: string;
  phone?: string | null;
}

export interface AllocationEvent {
  id: string;
  type: string;
  tokenId: string | null;
  slotId: string | null;
  doctorId: string | null;
  reason: string;
  payload: unknown;
  createdAt: string;
}

export interface Token {
  id: string;
  patientId: string;
  doctorId: string;
  slotId: string;
  tokenNumber: string;
  source: TokenSource;
  status: TokenStatus;
  priorityScoreAtIntake: number;
  requestedAt: string;
  allocatedAt?: string | null;
  calledAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  noShowAt?: string | null;
  patient?: Patient;
  doctor?: Doctor;
  slot?: Slot;
  events?: AllocationEvent[];
}

export interface DashboardOverview {
  date: string;
  doctorsAvailable: number;
  doctorsTotal: number;
  activeSlots: number;
  totalTokens: number;
  waitingPatients: number;
  completedConsultations: number;
  averageWaitMinutes: number;
  emergencyCases: number;
  noShows: number;
  cancellations: number;
  capacityUtilization: number;
  invariants: {
    capacityViolations: number;
    doubleAllocations: number;
    invalidTransitionAttemptsBlocked: number;
    orphanedTokens: number;
  };
}

export interface DoctorView {
  id: string;
  name: string;
  specialization: string;
  active: boolean;
  unavailable: boolean;
  delayMinutes: number;
  capacity: number;
  occupied: number;
  utilization: number;
}

export interface SlotView {
  id: string;
  doctorId: string;
  doctorName: string;
  startTime: string;
  endTime: string;
  status: SlotStatus;
  maximumCapacity: number;
  occupied: number;
}

export interface SimulationRun {
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

// ---- the board (everything the Today screen needs in one request) ----
export interface BoardToken {
  id: string;
  tokenNumber: string;
  source: TokenSource;
  status: TokenStatus;
  patientName: string;
  waitMinutes: number;
  priorityScore: number;
}

export interface BoardSlot {
  id: string;
  startTime: string;
  endTime: string;
  status: SlotStatus;
  maximumCapacity: number;
  effectiveCapacity: number;
  emergencyReserve: number;
  paidReserve: number;
  reserveReleased: boolean;
  placesTaken: number;
  holding: BoardToken[];
  waiting: BoardToken[];
}

export interface BoardDoctor {
  id: string;
  name: string;
  specialization: string;
  active: boolean;
  unavailable: boolean;
  delayMinutes: number;
  slots: BoardSlot[];
}

export interface Board {
  generatedAt: string;
  config: {
    basePriority: Record<string, number>;
    agingIntervalMinutes: number;
    agingPointsPerInterval: number;
    reserveReleaseAfterWaitMinutes: number;
  };
  doctors: BoardDoctor[];
}

export interface ActivityItem {
  id: string;
  type: string;
  createdAt: string;
  reason: string;
  tokenId: string | null;
  tokenNumber: string | null;
  tokenSource: TokenSource | null;
  patientName: string | null;
  doctorName: string | null;
  slotStart: string | null;
  slotEnd: string | null;
}
