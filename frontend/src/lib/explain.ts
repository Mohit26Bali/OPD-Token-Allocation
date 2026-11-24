// Plain-language wording for everything the dashboard shows. The backend speaks in codes (WALK_IN, ALLOCATED...); this is
// the one place that turns them into words a person at the front desk would use.
import type { ActivityItem, TokenSource, TokenStatus } from '../types/index.js';

export interface SourceInfo {
  label: string;
  blurb: string;
  /** small label chip */
  chip: string;
  /** filled place box */
  box: string;
}

export const SOURCE_INFO: Record<TokenSource, SourceInfo> = {
  EMERGENCY: {
    label: 'Emergency',
    blurb: 'Urgent cases. Seen first: they can use the emergency place kept free in every hour, or take one from someone else.',
    chip: 'bg-red-100 text-red-800 border-red-300',
    box: 'bg-red-500 text-white border-red-600',
  },
  PAID_PRIORITY: {
    label: 'Paid priority',
    blurb: 'Paid for faster service. Every hour keeps a place just for them.',
    chip: 'bg-amber-100 text-amber-900 border-amber-300',
    box: 'bg-amber-400 text-amber-950 border-amber-500',
  },
  FOLLOW_UP: {
    label: 'Follow-up visit',
    blurb: 'A returning patient. Goes ahead of walk-ins and online bookings.',
    chip: 'bg-violet-100 text-violet-800 border-violet-300',
    box: 'bg-violet-500 text-white border-violet-600',
  },
  ONLINE: {
    label: 'Online booking',
    blurb: 'Booked in advance on the website or app.',
    chip: 'bg-blue-100 text-blue-800 border-blue-300',
    box: 'bg-blue-500 text-white border-blue-600',
  },
  WALK_IN: {
    label: 'Walk-in',
    blurb: 'Came to the hospital without booking. Starts lowest, but moves up the longer they wait.',
    chip: 'bg-slate-100 text-slate-700 border-slate-300',
    box: 'bg-slate-500 text-white border-slate-600',
  },
};

export const SOURCE_ORDER: TokenSource[] = ['EMERGENCY', 'PAID_PRIORITY', 'FOLLOW_UP', 'ONLINE', 'WALK_IN'];

export interface StatusInfo {
  label: string;
  /** one sentence: what is going on, and what usually happens next */
  hint: string;
  /** position on the 5-step journey, or -1 for the ways a ticket can end early */
  step: number;
  chip: string;
}

export const STATUS_INFO: Record<TokenStatus, StatusInfo> = {
  WAITING: {
    label: 'Waiting for a place',
    hint: 'That hour is full. As soon as a place opens up, the waiting ticket with the highest priority gets it.',
    step: 0,
    chip: 'bg-slate-100 text-slate-700 border-slate-300',
  },
  ALLOCATED: {
    label: 'Has a place',
    hint: 'This patient has a place in that hour. Call them when the doctor is ready.',
    step: 1,
    chip: 'bg-teal-100 text-teal-800 border-teal-300',
  },
  CALLED: {
    label: 'Called',
    hint: 'The patient has been called. Start the consultation when they reach the doctor.',
    step: 2,
    chip: 'bg-blue-100 text-blue-800 border-blue-300',
  },
  IN_PROGRESS: {
    label: 'With the doctor',
    hint: 'The consultation is happening now. Finish it when the patient is done.',
    step: 3,
    chip: 'bg-amber-100 text-amber-900 border-amber-300',
  },
  COMPLETED: {
    label: 'Done',
    hint: 'The consultation is finished.',
    step: 4,
    chip: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
  CANCELLED: {
    label: 'Cancelled',
    hint: 'This ticket was cancelled. Its place went to someone else.',
    step: -1,
    chip: 'bg-slate-100 text-slate-500 border-slate-300',
  },
  NO_SHOW: {
    label: "Didn't show up",
    hint: "The patient didn't arrive, so the place was given to someone else.",
    step: -1,
    chip: 'bg-red-100 text-red-700 border-red-300',
  },
  REJECTED: {
    label: "Couldn't be placed",
    hint: 'No doctor had a free place for this ticket.',
    step: -1,
    chip: 'bg-red-100 text-red-700 border-red-300',
  },
};

export const JOURNEY = ['Waiting', 'Has a place', 'Called', 'With doctor', 'Done'];

export type TokenAction = 'call' | 'start' | 'complete' | 'noShow' | 'cancel';

export interface ActionInfo {
  action: TokenAction;
  label: string;
  primary?: boolean;
  /** asked before doing it, for things that cannot be undone */
  confirm?: string;
}

/** What a person can do with a ticket in each status (mirrors the backend's legal moves). */
export const ACTIONS_BY_STATUS: Partial<Record<TokenStatus, ActionInfo[]>> = {
  WAITING: [{ action: 'cancel', label: 'Cancel ticket', confirm: 'Cancel this ticket? This cannot be undone.' }],
  ALLOCATED: [
    { action: 'call', label: 'Call patient', primary: true },
    { action: 'noShow', label: "Didn't show up", confirm: 'Mark this patient as not showing up? Their place goes to someone else.' },
    { action: 'cancel', label: 'Cancel ticket', confirm: 'Cancel this ticket? Their place goes to someone else.' },
  ],
  CALLED: [
    { action: 'start', label: 'Start consultation', primary: true },
    { action: 'noShow', label: "Didn't show up", confirm: 'Mark this patient as not showing up? Their place goes to someone else.' },
  ],
  IN_PROGRESS: [{ action: 'complete', label: 'Finish consultation', primary: true }],
};

// ---------- times ----------
export function formatTime(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatRange(start: string | null | undefined, end: string | null | undefined): string {
  return start && end ? `${formatTime(start)}–${formatTime(end)}` : '';
}

export function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString();
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

// ---------- the activity feed ----------
export type Tone = 'info' | 'good' | 'warn' | 'bad';

/** One event as a sentence. The raw technical reason is kept separately and shown on request. */
export function describeEvent(e: ActivityItem): { icon: string; tone: Tone; text: string } {
  const who = e.tokenNumber ? `${e.tokenNumber}${e.patientName ? ` (${e.patientName})` : ''}` : 'A ticket';
  const doctor = e.doctorName ?? 'the doctor';
  const hour = formatRange(e.slotStart, e.slotEnd);
  const where = hour ? `${doctor}, ${hour}` : doctor;
  const kind = e.tokenSource ? SOURCE_INFO[e.tokenSource].label.toLowerCase() : null;

  switch (e.type) {
    case 'TOKEN_CREATED':
      return { icon: '🎫', tone: 'info', text: `${who} was created${kind ? ` as a ${kind}` : ''} for ${where}.` };
    case 'TOKEN_ALLOCATED':
      return { icon: '✅', tone: 'good', text: `${who} got a place with ${where}.` };
    case 'TOKEN_REALLOCATED':
      return { icon: '🔁', tone: 'warn', text: `${who} was moved to another hour: ${where}.` };
    case 'TOKEN_CANCELLED':
      return { icon: '🚫', tone: 'warn', text: `${who} was cancelled. The place was freed for someone waiting.` };
    case 'TOKEN_NO_SHOW':
      return { icon: '⏱️', tone: 'warn', text: `${who} didn't show up. The place was freed.` };
    case 'TOKEN_CALLED':
      return { icon: '📣', tone: 'info', text: `${who} was called to ${doctor}.` };
    case 'TOKEN_STARTED':
      return { icon: '🩺', tone: 'info', text: `${who} started the consultation with ${doctor}.` };
    case 'TOKEN_COMPLETED':
      return { icon: '🏁', tone: 'good', text: `${who} finished the consultation.` };
    case 'EMERGENCY_INSERTED':
      return { icon: '🚑', tone: 'bad', text: `Emergency ${who} was added for ${where}. Emergencies go to the front.` };
    case 'SLOT_CAPACITY_CHANGED':
      return { icon: '📐', tone: 'warn', text: `The number of places in ${where} was changed.` };
    case 'DOCTOR_DELAYED':
      return { icon: '⏳', tone: 'warn', text: `${doctor} is running late, so fewer patients fit in the time left.` };
    case 'DOCTOR_AVAILABILITY_CHANGED':
      return { icon: '🧑‍⚕️', tone: 'warn', text: `${doctor}'s availability changed.` };
    case 'TOKEN_REJECTED':
      return { icon: '❌', tone: 'bad', text: `${who} could not be placed: no doctor had a free place.` };
    default:
      return { icon: '•', tone: 'info', text: e.reason };
  }
}

export const TONE_CLASS: Record<Tone, string> = {
  info: 'border-slate-200 bg-white',
  good: 'border-emerald-200 bg-emerald-50/60',
  warn: 'border-amber-200 bg-amber-50/60',
  bad: 'border-red-200 bg-red-50/70',
};

/** "Walk-in starts at 20 points, +1 for every 10 minutes waited, so 26 now" */
export function explainPriority(
  source: TokenSource,
  waitMinutes: number,
  score: number,
  config: { basePriority: Record<string, number>; agingIntervalMinutes: number; agingPointsPerInterval: number }
): string {
  const base = config.basePriority[source] ?? 0;
  const bonus = score - base;
  return `${SOURCE_INFO[source].label} starts at ${base} points. It gains ${config.agingPointsPerInterval} for every ${config.agingIntervalMinutes} minutes waited (${waitMinutes} min so far, +${bonus}), so it is at ${score} now. Higher goes first.`;
}
