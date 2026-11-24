import './setupEnv.js';
import { prisma } from '../../src/utils/prisma.js';

export { prisma };

export async function resetDb() {
  await prisma.allocationEvent.deleteMany();
  await prisma.token.deleteMany();
  await prisma.opdSlot.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.doctor.deleteMany();
}

export async function seedBasicDoctorWithSlot(overrides: Partial<{ maximumCapacity: number; emergencyReserve: number; paidReserve: number }> = {}) {
  const doctor = await prisma.doctor.create({ data: { name: 'Dr. Test', specialization: 'General Medicine' } });
  const now = new Date();
  const start = new Date(now.getTime() + 60_000);
  const end = new Date(start.getTime() + 60 * 60_000);
  const slot = await prisma.opdSlot.create({
    data: {
      doctorId: doctor.id,
      date: new Date(start.toDateString()),
      startTime: start,
      endTime: end,
      maximumCapacity: overrides.maximumCapacity ?? 10,
      // Defaults to 0 reserve so general-pool (WALK_IN/ONLINE/FOLLOW_UP) tests
      // aren't accidentally starved by an unrelated reserve quota; tests that
      // specifically exercise reserved capacity pass emergencyReserve/paidReserve explicitly.
      emergencyReserve: overrides.emergencyReserve ?? 0,
      paidReserve: overrides.paidReserve ?? 0,
      status: 'OPEN',
    },
  });
  return { doctor, slot };
}
