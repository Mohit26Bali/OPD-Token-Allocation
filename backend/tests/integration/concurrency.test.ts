import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { prisma, resetDb, seedBasicDoctorWithSlot } from './testDb.js';

const app = createApp();

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Concurrency: two requests racing for the last unit of capacity', () => {
  it('allocates exactly one of two simultaneous token creations when capacity=1, never both', async () => {
    const { doctor, slot } = await seedBasicDoctorWithSlot({ maximumCapacity: 1 });

    const [resA, resB] = await Promise.all([
      request(app).post('/api/tokens').send({ doctorId: doctor.id, slotId: slot.id, source: 'WALK_IN', patientName: 'Racer A' }),
      request(app).post('/api/tokens').send({ doctorId: doctor.id, slotId: slot.id, source: 'WALK_IN', patientName: 'Racer B' }),
    ]);

    expect([resA.status, resB.status].every((s) => s === 201)).toBe(true);

    const statuses = [resA.body.status, resB.body.status].sort();
    // Exactly one gets ALLOCATED, the other remains WAITING — never both ALLOCATED.
    expect(statuses).toEqual(['ALLOCATED', 'WAITING']);

    const occupiedCount = await prisma.token.count({
      where: { slotId: slot.id, status: { in: ['ALLOCATED', 'CALLED', 'IN_PROGRESS', 'COMPLETED'] } },
    });
    expect(occupiedCount).toBe(1);
  });

  it('handles 5 simultaneous requests against capacity=2 without ever exceeding capacity', async () => {
    const { doctor, slot } = await seedBasicDoctorWithSlot({ maximumCapacity: 2 });

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        request(app).post('/api/tokens').send({ doctorId: doctor.id, slotId: slot.id, source: 'WALK_IN', patientName: `Racer ${i}` })
      )
    );

    expect(results.every((r) => r.status === 201)).toBe(true);
    const allocatedCount = results.filter((r) => r.body.status === 'ALLOCATED').length;
    expect(allocatedCount).toBe(2);

    const occupiedCount = await prisma.token.count({
      where: { slotId: slot.id, status: { in: ['ALLOCATED', 'CALLED', 'IN_PROGRESS', 'COMPLETED'] } },
    });
    expect(occupiedCount).toBe(2);
  });
});
