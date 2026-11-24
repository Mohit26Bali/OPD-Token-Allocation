import { z } from 'zod';

// Limits on what the API accepts. Names and notes are short on purpose: anything longer is a mistake or an attack, and
// unbounded text would end up on every dashboard that shows it.
const text = (max: number) => z.string().trim().min(1, 'This cannot be empty').max(max, `At most ${max} characters`);
const id = z.string().trim().min(1).max(64);
const phone = z
  .string()
  .trim()
  .regex(/^\+?[\d\s().-]{6,20}$/, 'Enter a phone number with 6 to 20 digits')
  .optional();
const capacity = z.number().int().min(0).max(500);

export const createDoctorSchema = z.object({
  name: text(120),
  specialization: text(100),
});

export const updateDoctorSchema = z.object({
  name: text(120).optional(),
  specialization: text(100).optional(),
  active: z.boolean().optional(),
});

export const createSlotSchema = z
  .object({
    doctorId: id,
    date: z.coerce.date(),
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
    maximumCapacity: capacity,
    emergencyReserve: capacity.optional(),
    paidReserve: capacity.optional(),
  })
  .superRefine((slot, ctx) => {
    if (slot.endTime.getTime() <= slot.startTime.getTime()) {
      ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'The end time must be after the start time' });
    }
    if (slot.endTime.getTime() - slot.startTime.getTime() > 12 * 60 * 60 * 1000) {
      ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'An hour (slot) cannot be longer than 12 hours' });
    }
    if ((slot.emergencyReserve ?? 0) + (slot.paidReserve ?? 0) > slot.maximumCapacity) {
      ctx.addIssue({ code: 'custom', path: ['maximumCapacity'], message: 'The emergency and paid reserves together cannot be more than the maximum capacity' });
    }
  });

export const updateSlotSchema = z.object({
  maximumCapacity: capacity.optional(),
  status: z.enum(['OPEN', 'PAUSED', 'CLOSED', 'COMPLETED']).optional(),
});

export const createTokenSchema = z.object({
  patientId: id.optional(),
  patientName: text(120).optional(),
  patientPhone: phone,
  doctorId: id,
  slotId: id,
  source: z.enum(['ONLINE', 'WALK_IN', 'PAID_PRIORITY', 'FOLLOW_UP']),
});

export const emergencySchema = z.object({
  patientName: text(120),
  patientPhone: phone,
  doctorId: id,
  slotId: id.optional(),
  reason: text(300),
});

export const delayDoctorSchema = z.object({
  delayMinutes: z.number().int().min(1).max(480),
});

export const unavailableDoctorSchema = z.object({
  reason: text(300),
});
