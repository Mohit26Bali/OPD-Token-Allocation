/**
 * Scripted "Demo OPD Day" scenario: 3 doctors, 4 slots each, and a timeline
 * of events deliberately chosen to exercise every mechanism the algorithm
 * implements (see docs/algorithm.md and the assignment's simulation
 * requirement, section 24/47 of the working spec).
 *
 * This module only describes WHAT happens and WHEN — it contains no
 * allocation logic itself. simulationService.ts drives these steps through
 * the exact same tokenService/emergencyService/doctorService/slotService
 * functions the REST API uses, so the simulation can never diverge from
 * production behavior.
 */

export type ScenarioStepKind =
  | 'CREATE_TOKEN'
  | 'CANCEL_TOKEN'
  | 'NO_SHOW_TOKEN'
  | 'EMERGENCY'
  | 'DELAY_DOCTOR'
  | 'CAPACITY_CHANGE'
  | 'NOTE';

export interface ScenarioStep {
  minuteOffset: number; // minutes after 08:45 (the simulated day start)
  kind: ScenarioStepKind;
  label: string;
  /** identifies this step's created token so a later step can reference it */
  key?: string;
  /** key referencing a token created earlier in the timeline, for CANCEL/NO_SHOW steps */
  refKey?: string;
  data?: Record<string, unknown>;
}

/**
 * `doctorKey`/`slotKey` are resolved at run time against the doctors/slots
 * simulationService actually creates (Sharma/Patel/Rao, slot index 0..3).
 */
export const demoDaySteps: ScenarioStep[] = [
  { minuteOffset: 0, kind: 'NOTE', label: 'Doctors arrive; OPD desk opens for the day.' },
  { minuteOffset: 5, kind: 'CREATE_TOKEN', label: 'Online booking for Dr. Sharma 09:00 slot', data: { doctorKey: 'sharma', slotIndex: 0, source: 'ONLINE', patient: 'Ritu Malhotra' } },
  { minuteOffset: 8, kind: 'CREATE_TOKEN', label: 'Online booking for Dr. Patel 09:00 slot', key: 'patel-online-1', data: { doctorKey: 'patel', slotIndex: 0, source: 'ONLINE', patient: 'Karan Bedi' } },
  { minuteOffset: 10, kind: 'CREATE_TOKEN', label: 'Follow-up token for Dr. Rao 09:00 slot', key: 'rao-followup-1', data: { doctorKey: 'rao', slotIndex: 0, source: 'FOLLOW_UP', patient: 'Geeta Rao' } },
  { minuteOffset: 15, kind: 'NOTE', label: 'OPD officially opens at 09:00.' },
  { minuteOffset: 20, kind: 'CREATE_TOKEN', label: 'Walk-in at Dr. Sharma desk', data: { doctorKey: 'sharma', slotIndex: 0, source: 'WALK_IN', patient: 'Rahul Verma' } },
  { minuteOffset: 27, kind: 'CREATE_TOKEN', label: 'Paid priority patient for Dr. Sharma', data: { doctorKey: 'sharma', slotIndex: 0, source: 'PAID_PRIORITY', patient: 'Vikram Shah' } },
  { minuteOffset: 35, kind: 'CANCEL_TOKEN', label: 'Online patient at Dr. Patel cancels', refKey: 'patel-online-1' },
  { minuteOffset: 40, kind: 'CREATE_TOKEN', label: 'Walk-in fills the freed Dr. Patel capacity', data: { doctorKey: 'patel', slotIndex: 0, source: 'WALK_IN', patient: 'Sneha Gupta' } },
  { minuteOffset: 50, kind: 'DELAY_DOCTOR', label: 'Dr. Sharma delayed by 20 minutes', data: { doctorKey: 'sharma', delayMinutes: 20 } },
  { minuteOffset: 55, kind: 'EMERGENCY', label: 'Emergency patient arrives for Dr. Sharma', data: { doctorKey: 'sharma', slotIndex: 0, patient: 'Arjun Reddy', reason: 'Suspected cardiac event' } },
  { minuteOffset: 65, kind: 'NO_SHOW_TOKEN', label: 'Dr. Rao follow-up patient does not show up (past grace period)', refKey: 'rao-followup-1' },
  { minuteOffset: 75, kind: 'CAPACITY_CHANGE', label: 'Dr. Rao 09:00 slot capacity reduced from 10 to 0 (equipment issue takes the room fully offline)', data: { doctorKey: 'rao', slotIndex: 0, newCapacity: 0 } },
  { minuteOffset: 80, kind: 'CREATE_TOKEN', label: 'Walk-in arrives at Dr. Rao 09:00 slot which now has zero capacity (demonstrates the no-suitable-capacity case: token stays WAITING, never dropped)', data: { doctorKey: 'rao', slotIndex: 0, source: 'WALK_IN', patient: 'Meena Iyer' } },
  { minuteOffset: 90, kind: 'NOTE', label: '10:00 slot transitions begin for all doctors.' },
];
