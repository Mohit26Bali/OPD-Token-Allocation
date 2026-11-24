import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { prisma, resetDb, seedBasicDoctorWithSlot } from './testDb.js';

const app = createApp();

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
});

async function newToken(doctorId: string, slotId: string, source: string, patientName: string) {
  const res = await request(app).post('/api/tokens').send({ doctorId, slotId, source, patientName });
  expect(res.status).toBe(201);
  return res.body;
}

describe('GET /api/dashboard/board', () => {
  it('shows each doctor with their hours, who holds a place and who is waiting', async () => {
    const { doctor, slot } = await seedBasicDoctorWithSlot({ maximumCapacity: 2, emergencyReserve: 0, paidReserve: 0 });
    await newToken(doctor.id, slot.id, 'WALK_IN', 'First Patient');
    await newToken(doctor.id, slot.id, 'ONLINE', 'Second Patient');
    await newToken(doctor.id, slot.id, 'WALK_IN', 'Third Patient');

    const res = await request(app).get('/api/dashboard/board');
    expect(res.status).toBe(200);
    expect(res.body.config.basePriority.EMERGENCY).toBe(100);

    const [d] = res.body.doctors;
    expect(d.name).toBe('Dr. Test');
    const [s] = d.slots;
    expect(s.maximumCapacity).toBe(2);
    expect(s.effectiveCapacity).toBe(2);
    expect(s.placesTaken).toBe(2);
    expect(s.holding.map((t: any) => t.patientName).sort()).toEqual(['First Patient', 'Second Patient']);
    expect(s.waiting).toHaveLength(1);
    expect(s.waiting[0]).toMatchObject({ patientName: 'Third Patient', status: 'WAITING', source: 'WALK_IN', priorityScore: 20 });
  });

  it('never reports more places taken than the hour has', async () => {
    const { doctor, slot } = await seedBasicDoctorWithSlot({ maximumCapacity: 3 });
    for (let i = 0; i < 6; i++) await newToken(doctor.id, slot.id, 'WALK_IN', `P${i}`);
    const { body } = await request(app).get('/api/dashboard/board');
    const s = body.doctors[0].slots[0];
    expect(s.placesTaken).toBeLessThanOrEqual(s.maximumCapacity);
    expect(s.placesTaken + s.waiting.length).toBe(6);
  });

  it('lowers the places of an hour when the doctor is running late', async () => {
    const { doctor, slot } = await seedBasicDoctorWithSlot({ maximumCapacity: 6 });
    // the helper's slot starts a minute from now and lasts an hour; a 55 minute delay leaves about 4 minutes
    await request(app).post(`/api/doctors/${doctor.id}/delay`).send({ delayMinutes: 55 }).expect(200);
    const { body } = await request(app).get('/api/dashboard/board');
    const s = body.doctors[0].slots[0];
    expect(body.doctors[0].delayMinutes).toBe(55);
    expect(s.effectiveCapacity).toBeLessThan(s.maximumCapacity);
    expect(slot.id).toBe(s.id);
  });
});

describe('GET /api/dashboard/activity', () => {
  it('lists what happened with names attached, newest first', async () => {
    const { doctor, slot } = await seedBasicDoctorWithSlot({ maximumCapacity: 5 });
    await newToken(doctor.id, slot.id, 'WALK_IN', 'Anita Singh');

    const res = await request(app).get('/api/dashboard/activity?limit=10');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    const created = res.body.find((e: any) => e.type === 'TOKEN_CREATED');
    expect(created).toMatchObject({ tokenNumber: 'A001', patientName: 'Anita Singh', doctorName: 'Dr. Test', tokenSource: 'WALK_IN' });
    const times = res.body.map((e: any) => new Date(e.createdAt).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it('caps the limit and survives a junk limit', async () => {
    const { doctor, slot } = await seedBasicDoctorWithSlot();
    for (let i = 0; i < 3; i++) await newToken(doctor.id, slot.id, 'WALK_IN', `P${i}`);
    expect((await request(app).get('/api/dashboard/activity?limit=2')).body).toHaveLength(2);
    expect((await request(app).get('/api/dashboard/activity?limit=abc')).status).toBe(200);
    expect((await request(app).get('/api/dashboard/activity?limit=-5')).status).toBe(200);
  });
});

describe('ticket numbers', () => {
  it('never reuse a number that already exists, even when existing numbers were not created in order', async () => {
    const { doctor, slot } = await seedBasicDoctorWithSlot({ maximumCapacity: 20 });
    const patient = await prisma.patient.create({ data: { name: 'Pre-existing' } });
    // like the sample data: numbers share one counter across prefixes, so "A007" exists while only two A-tickets do
    for (const tokenNumber of ['A001', 'P002', 'A007']) {
      await prisma.token.create({
        data: { patientId: patient.id, doctorId: doctor.id, slotId: slot.id, tokenNumber, source: tokenNumber.startsWith('P') ? 'PAID_PRIORITY' : 'WALK_IN', status: 'ALLOCATED', priorityScoreAtIntake: 20, requestedAt: new Date() },
      });
    }
    const made = await newToken(doctor.id, slot.id, 'WALK_IN', 'New Walk-in');
    expect(made.tokenNumber).toBe('A008');
    const paid = await newToken(doctor.id, slot.id, 'PAID_PRIORITY', 'New Paid');
    expect(paid.tokenNumber).toBe('P003');
  });

  it('stay unique when many are created at once (a busy answer is fine, a crash or a duplicate is not)', async () => {
    const { doctor, slot } = await seedBasicDoctorWithSlot({ maximumCapacity: 20 });
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => request(app).post('/api/tokens').send({ doctorId: doctor.id, slotId: slot.id, source: 'WALK_IN', patientName: `Racer ${i}` }))
    );
    const statuses = results.map((r) => r.status);
    expect(statuses.every((s) => s === 201 || s === 409)).toBe(true);
    expect(statuses.filter((s) => s === 201).length).toBeGreaterThanOrEqual(1);
    const numbers = results.filter((r) => r.status === 201).map((r) => r.body.tokenNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
  });
});

describe('POST /api/simulation/run', () => {
  it('refuses to wipe the data unless the request says it means to', async () => {
    const { doctor } = await seedBasicDoctorWithSlot();
    const res = await request(app).post('/api/simulation/run').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/replaces all data/);
    expect(await prisma.doctor.count({ where: { id: doctor.id } })).toBe(1);
  });

  it('is switched off in production unless ENABLE_SIMULATION=1', async () => {
    const { doctor } = await seedBasicDoctorWithSlot();
    vi.stubEnv('NODE_ENV', 'production');
    try {
      const res = await request(app).post('/api/simulation/run').send({ confirm: 'replace-all-data' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(await prisma.doctor.count({ where: { id: doctor.id } })).toBe(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('runs the demo when confirmed (on the test database), replacing what was there', async () => {
    await seedBasicDoctorWithSlot();
    const res = await request(app).post('/api/simulation/run').send({ confirm: 'replace-all-data' });
    expect(res.status).toBe(201);
    expect(res.body.timeline.length).toBeGreaterThan(5);
    expect(await prisma.doctor.count()).toBe(3);
  }, 30000);
});

describe('the database the tests talk to', () => {
  const saved = { test: process.env.TEST_DATABASE_URL, main: process.env.DATABASE_URL };

  async function loadClientWith(testUrl: string | undefined) {
    vi.resetModules();
    process.env.TEST_DATABASE_URL = testUrl;
    return import('../../src/utils/prisma.js');
  }

  it('is the separate test database', () => {
    expect(saved.test).toBeTruthy();
    expect(saved.test).not.toBe(saved.main);
    expect(new URL(saved.test!).pathname).toMatch(/test/i);
  });

  it('refuses to start without TEST_DATABASE_URL, or with the real database, or a name without "test"', async () => {
    try {
      await expect(loadClientWith('')).rejects.toThrow(/TEST_DATABASE_URL/);
      await expect(loadClientWith(saved.main)).rejects.toThrow(/different database/);
      await expect(loadClientWith('postgresql://u:p@localhost:5432/opd_production?schema=public')).rejects.toThrow(/"test" in its name/);
    } finally {
      process.env.TEST_DATABASE_URL = saved.test;
      vi.resetModules();
    }
  });
});
