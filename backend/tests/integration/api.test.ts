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

describe('Doctors API', () => {
  it('creates and lists doctors', async () => {
    await request(app).post('/api/doctors').send({ name: 'Dr. X', specialization: 'ENT' }).expect(201);
    const res = await request(app).get('/api/doctors').expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Dr. X');
  });
});

describe('Token lifecycle', () => {
  it('creates a token and it becomes ALLOCATED when capacity is available', async () => {
    const { doctor, slot } = await seedBasicDoctorWithSlot();
    const res = await request(app)
      .post('/api/tokens')
      .send({ doctorId: doctor.id, slotId: slot.id, source: 'WALK_IN', patientName: 'Alice' })
      .expect(201);
    expect(res.body.status).toBe('ALLOCATED');
    expect(res.body.tokenNumber).toMatch(/^A\d{3}$/);
  });

  it('rejects token creation for a CLOSED slot', async () => {
    const { doctor, slot } = await seedBasicDoctorWithSlot();
    await prisma.opdSlot.update({ where: { id: slot.id }, data: { status: 'CLOSED' } });
    const res = await request(app)
      .post('/api/tokens')
      .send({ doctorId: doctor.id, slotId: slot.id, source: 'WALK_IN', patientName: 'Bob' })
      .expect(409);
    expect(res.body.error.code).toBe('SLOT_CLOSED');
  });

  it('cancellation frees capacity and allocates the next waiting token', async () => {
    const { doctor, slot } = await seedBasicDoctorWithSlot({ maximumCapacity: 1 });
    const first = await request(app)
      .post('/api/tokens')
      .send({ doctorId: doctor.id, slotId: slot.id, source: 'WALK_IN', patientName: 'First' })
      .expect(201);
    expect(first.body.status).toBe('ALLOCATED');

    const second = await request(app)
      .post('/api/tokens')
      .send({ doctorId: doctor.id, slotId: slot.id, source: 'WALK_IN', patientName: 'Second' })
      .expect(201);
    expect(second.body.status).toBe('WAITING');

    await request(app).post(`/api/tokens/${first.body.id}/cancel`).expect(200);

    const secondRefetch = await request(app).get(`/api/tokens/${second.body.id}`).expect(200);
    expect(secondRefetch.body.status).toBe('ALLOCATED');
  });

  it('rejects a duplicate cancellation with 409', async () => {
    const { doctor, slot } = await seedBasicDoctorWithSlot();
    const token = await request(app)
      .post('/api/tokens')
      .send({ doctorId: doctor.id, slotId: slot.id, source: 'WALK_IN', patientName: 'Carl' })
      .expect(201);
    await request(app).post(`/api/tokens/${token.body.id}/cancel`).expect(200);
    const res = await request(app).post(`/api/tokens/${token.body.id}/cancel`).expect(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('rejects cancelling an already-completed token', async () => {
    const { doctor, slot } = await seedBasicDoctorWithSlot();
    const token = await request(app)
      .post('/api/tokens')
      .send({ doctorId: doctor.id, slotId: slot.id, source: 'WALK_IN', patientName: 'Dana' })
      .expect(201);
    await request(app).post(`/api/tokens/${token.body.id}/call`).expect(200);
    await request(app).post(`/api/tokens/${token.body.id}/start`).expect(200);
    await request(app).post(`/api/tokens/${token.body.id}/complete`).expect(200);
    const res = await request(app).post(`/api/tokens/${token.body.id}/cancel`).expect(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('rejects no-show before the grace period has elapsed', async () => {
    const { doctor, slot } = await seedBasicDoctorWithSlot();
    const token = await request(app)
      .post('/api/tokens')
      .send({ doctorId: doctor.id, slotId: slot.id, source: 'WALK_IN', patientName: 'Eve' })
      .expect(201);
    const res = await request(app).post(`/api/tokens/${token.body.id}/no-show`).expect(409);
    expect(res.body.error.code).toBe('NO_SHOW_GRACE_PERIOD_ACTIVE');
  });

  it('allows no-show once the grace period has elapsed and frees capacity', async () => {
    const doctor = await prisma.doctor.create({ data: { name: 'Dr. Grace', specialization: 'General Medicine' } });
    const start = new Date(Date.now() - 30 * 60_000); // slot started 30 min ago
    const end = new Date(start.getTime() + 60 * 60_000);
    const slot = await prisma.opdSlot.create({
      data: { doctorId: doctor.id, date: new Date(start.toDateString()), startTime: start, endTime: end, maximumCapacity: 1, status: 'OPEN' },
    });
    const token = await request(app)
      .post('/api/tokens')
      .send({ doctorId: doctor.id, slotId: slot.id, source: 'WALK_IN', patientName: 'Frank' })
      .expect(201);
    expect(token.body.status).toBe('ALLOCATED');

    const res = await request(app).post(`/api/tokens/${token.body.id}/no-show`).expect(200);
    expect(res.body.status).toBe('NO_SHOW');
  });
});

describe('Emergency insertion', () => {
  it('allocates an emergency into reserved capacity even when general pool is full', async () => {
    const { doctor, slot } = await seedBasicDoctorWithSlot({ maximumCapacity: 1, emergencyReserve: 1, paidReserve: 0 });
    await request(app)
      .post('/api/tokens')
      .send({ doctorId: doctor.id, slotId: slot.id, source: 'WALK_IN', patientName: 'Regular' })
      .expect(201);

    const res = await request(app)
      .post('/api/emergencies')
      .send({ doctorId: doctor.id, slotId: slot.id, patientName: 'Emergency Guy', reason: 'chest pain' })
      .expect(201);

    expect(res.body.token.status).toBe('ALLOCATED');
    expect(res.body.token.source).toBe('EMERGENCY');
  });

  it('displaces a lower-priority allocated token when both general and reserve are full', async () => {
    const { doctor, slot } = await seedBasicDoctorWithSlot({ maximumCapacity: 1, emergencyReserve: 0, paidReserve: 0 });
    const occupant = await request(app)
      .post('/api/tokens')
      .send({ doctorId: doctor.id, slotId: slot.id, source: 'WALK_IN', patientName: 'Occupant' })
      .expect(201);
    expect(occupant.body.status).toBe('ALLOCATED');

    const res = await request(app)
      .post('/api/emergencies')
      .send({ doctorId: doctor.id, slotId: slot.id, patientName: 'Emergency Guy', reason: 'chest pain' })
      .expect(201);

    expect(res.body.token.status).toBe('ALLOCATED');
    expect(res.body.displaced).not.toBeNull();
    expect(res.body.displaced.displacedTokenId).toBe(occupant.body.id);

    const occupantRefetch = await request(app).get(`/api/tokens/${occupant.body.id}`).expect(200);
    // No alternate slot existed for this doctor in the test, so it should have returned to WAITING, never vanished.
    expect(occupantRefetch.body.status).toBe('WAITING');
  });
});

describe('Doctor delay', () => {
  it('records the delay and recalculates open slots without revoking occupied tokens', async () => {
    const { doctor, slot } = await seedBasicDoctorWithSlot();
    const token = await request(app)
      .post('/api/tokens')
      .send({ doctorId: doctor.id, slotId: slot.id, source: 'WALK_IN', patientName: 'Held' })
      .expect(201);
    expect(token.body.status).toBe('ALLOCATED');

    await request(app).post(`/api/doctors/${doctor.id}/delay`).send({ delayMinutes: 20 }).expect(200);

    const refetch = await request(app).get(`/api/tokens/${token.body.id}`).expect(200);
    expect(refetch.body.status).toBe('ALLOCATED');
  });
});

describe('Idempotency', () => {
  it('rejects a duplicate no-show the same way as any other invalid transition', async () => {
    const doctor = await prisma.doctor.create({ data: { name: 'Dr. Idem', specialization: 'General Medicine' } });
    const start = new Date(Date.now() - 30 * 60_000);
    const end = new Date(start.getTime() + 60 * 60_000);
    const slot = await prisma.opdSlot.create({
      data: { doctorId: doctor.id, date: new Date(start.toDateString()), startTime: start, endTime: end, maximumCapacity: 1, status: 'OPEN' },
    });
    const token = await request(app)
      .post('/api/tokens')
      .send({ doctorId: doctor.id, slotId: slot.id, source: 'WALK_IN', patientName: 'Gina' })
      .expect(201);
    await request(app).post(`/api/tokens/${token.body.id}/no-show`).expect(200);
    const res = await request(app).post(`/api/tokens/${token.body.id}/no-show`).expect(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });
});

describe('Dashboard invariants', () => {
  it('reports zero capacity violations after a burst of activity', async () => {
    const { doctor, slot } = await seedBasicDoctorWithSlot({ maximumCapacity: 2 });
    for (const name of ['A', 'B', 'C']) {
      await request(app).post('/api/tokens').send({ doctorId: doctor.id, slotId: slot.id, source: 'WALK_IN', patientName: name });
    }
    const res = await request(app).get('/api/dashboard/overview').expect(200);
    expect(res.body.invariants.capacityViolations).toBe(0);
  });
});
