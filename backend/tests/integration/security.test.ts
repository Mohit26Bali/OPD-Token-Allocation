import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { prisma, resetDb, seedBasicDoctorWithSlot } from './testDb.js';

const KEY = 'a-long-random-staff-key-1234';

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
});

describe('staff key', () => {
  const app = createApp({ apiKey: KEY });

  it('is required on every /api request', async () => {
    expect((await request(app).get('/api/doctors')).status).toBe(401);
    expect((await request(app).get('/api/doctors').set('X-API-Key', 'wrong')).status).toBe(401);
    expect((await request(app).get('/api/doctors').set('X-API-Key', KEY.slice(0, -1))).status).toBe(401);
    expect((await request(app).get('/api/doctors').set('X-API-Key', `${KEY}x`)).status).toBe(401);
    const res = await request(app).get('/api/doctors').set('X-API-Key', KEY);
    expect(res.status).toBe(200);
  });

  it('guards the dangerous routes too, not just the reads', async () => {
    expect((await request(app).post('/api/simulation/run').send({ confirm: 'replace-all-data' })).status).toBe(401);
    expect((await request(app).post('/api/emergencies').send({})).status).toBe(401);
    expect((await request(app).post('/api/tokens/abc/cancel')).status).toBe(401);
  });

  it('leaves the health check open', async () => {
    expect((await request(app).get('/health')).status).toBe(200);
  });

  it('does not tell a visitor why the key was refused', async () => {
    const res = await request(app).get('/api/doctors');
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(JSON.stringify(res.body)).not.toContain(KEY);
  });
});

describe('production start-up', () => {
  it('refuses to start without a real staff key', () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      expect(() => createApp({ apiKey: null })).toThrow(/API_KEY must be set/);
      expect(() => createApp({ apiKey: 'short' })).toThrow(/API_KEY must be set/);
      expect(() => createApp({ apiKey: KEY })).not.toThrow();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('request limits', () => {
  it('rate limits one address', async () => {
    const app = createApp({ apiKey: null, rateLimitPerMinute: 3 });
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await request(app).get('/api/doctors')).status);
    expect(codes).toEqual([200, 200, 200, 429, 429]);
    const limited = await request(app).get('/api/doctors');
    expect(limited.body.error.code).toBe('RATE_LIMITED');
  });

  it('refuses oversized and malformed bodies with a clear error, not a crash', async () => {
    const app = createApp({ apiKey: null });
    const big = await request(app).post('/api/doctors').send({ name: 'x'.repeat(60_000), specialization: 'y' });
    expect(big.status).toBe(413);
    const broken = await request(app).post('/api/doctors').set('Content-Type', 'application/json').send('{"name": ');
    expect(broken.status).toBe(400);
    expect(broken.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('sets security headers and hides the framework', async () => {
    const res = await request(createApp({ apiKey: null })).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('allows no cross-site access unless a site is named, and never "*"', async () => {
    const closed = await request(createApp({ apiKey: null })).get('/health').set('Origin', 'https://evil.example');
    expect(closed.headers['access-control-allow-origin']).toBeUndefined();

    const open = createApp({ apiKey: null, corsOrigins: ['https://clinic.example'] });
    const allowed = await request(open).get('/health').set('Origin', 'https://clinic.example');
    expect(allowed.headers['access-control-allow-origin']).toBe('https://clinic.example');
    const other = await request(open).get('/health').set('Origin', 'https://evil.example');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();

    vi.stubEnv('CORS_ORIGINS', '*');
    try {
      const star = await request(createApp({ apiKey: null })).get('/health').set('Origin', 'https://evil.example');
      expect(star.headers['access-control-allow-origin']).toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('input checks', () => {
  const app = createApp({ apiKey: null });

  it('refuses over-long names, bad phone numbers and out-of-range numbers', async () => {
    expect((await request(app).post('/api/doctors').send({ name: 'x'.repeat(121), specialization: 'a' })).status).toBe(400);
    expect((await request(app).post('/api/doctors').send({ name: '   ', specialization: 'a' })).status).toBe(400);
    expect((await request(app).post('/api/doctors').send({ name: { a: 1 }, specialization: 'a' })).status).toBe(400);

    const { doctor, slot } = await seedBasicDoctorWithSlot();
    const badPhone = await request(app).post('/api/tokens').send({ doctorId: doctor.id, slotId: slot.id, source: 'WALK_IN', patientName: 'A', patientPhone: 'call me' });
    expect(badPhone.status).toBe(400);
    expect((await request(app).post(`/api/doctors/${doctor.id}/delay`).send({ delayMinutes: 481 })).status).toBe(400);
    expect((await request(app).post(`/api/doctors/${doctor.id}/delay`).send({ delayMinutes: 0 })).status).toBe(400);
    expect((await request(app).post('/api/emergencies').send({ doctorId: doctor.id, patientName: 'E', reason: 'r'.repeat(301) })).status).toBe(400);
  });

  it('refuses nonsense hours', async () => {
    const { doctor } = await seedBasicDoctorWithSlot();
    const start = new Date('2030-01-01T09:00:00Z');
    const base = { doctorId: doctor.id, date: '2030-01-01', startTime: start.toISOString(), maximumCapacity: 10 };
    const endBeforeStart = await request(app).post('/api/slots').send({ ...base, endTime: '2030-01-01T08:00:00Z' });
    expect(endBeforeStart.status).toBe(400);
    const tooLong = await request(app).post('/api/slots').send({ ...base, endTime: '2030-01-02T09:00:00Z' });
    expect(tooLong.status).toBe(400);
    const reserves = await request(app).post('/api/slots').send({ ...base, endTime: '2030-01-01T10:00:00Z', emergencyReserve: 6, paidReserve: 6 });
    expect(reserves.status).toBe(400);
    const huge = await request(app).post('/api/slots').send({ ...base, endTime: '2030-01-01T10:00:00Z', maximumCapacity: 100000 });
    expect(huge.status).toBe(400);
  });
});

describe('business rules', () => {
  const app = createApp({ apiKey: null });

  it('does not let one doctor have two overlapping hours', async () => {
    const { doctor } = await seedBasicDoctorWithSlot();
    const make = (from: string, to: string) =>
      request(app).post('/api/slots').send({ doctorId: doctor.id, date: '2031-05-05', startTime: `2031-05-05T${from}:00Z`, endTime: `2031-05-05T${to}:00Z`, maximumCapacity: 5 });

    expect((await make('09:00', '10:00')).status).toBe(201);
    const clash = await make('09:30', '10:30');
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('SLOT_OVERLAP');
    expect((await make('10:00', '11:00')).status).toBe(201); // back to back is fine
  });

  it('only adds hours for a doctor who exists and is active', async () => {
    const body = { date: '2031-05-06', startTime: '2031-05-06T09:00:00Z', endTime: '2031-05-06T10:00:00Z', maximumCapacity: 5 };
    expect((await request(app).post('/api/slots').send({ ...body, doctorId: 'no-such-doctor' })).status).toBe(404);
    const { doctor } = await seedBasicDoctorWithSlot();
    await prisma.doctor.update({ where: { id: doctor.id }, data: { active: false } });
    const res = await request(app).post('/api/slots').send({ ...body, doctorId: doctor.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DOCTOR_NOT_AVAILABLE');
  });

  it('gives no ticket to a doctor who is not available', async () => {
    const { doctor, slot } = await seedBasicDoctorWithSlot();
    await prisma.doctor.update({ where: { id: doctor.id }, data: { active: false } });
    const res = await request(app).post('/api/tokens').send({ doctorId: doctor.id, slotId: slot.id, source: 'WALK_IN', patientName: 'Late Comer' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DOCTOR_NOT_AVAILABLE');
    expect(await prisma.token.count()).toBe(0);
  });

  it('says so when the patient or the doctor does not exist, instead of a server error', async () => {
    const { doctor, slot } = await seedBasicDoctorWithSlot();
    const noPatient = await request(app).post('/api/tokens').send({ doctorId: doctor.id, slotId: slot.id, source: 'ONLINE', patientId: 'ghost' });
    expect(noPatient.status).toBe(404);
    const noDoctor = await request(app).post('/api/tokens').send({ doctorId: 'ghost', slotId: slot.id, source: 'ONLINE', patientName: 'X' });
    expect([404, 400, 409]).toContain(noDoctor.status);
    expect(noDoctor.status).not.toBe(500);
  });

  it('gives one live ticket per patient per hour, but allows another hour or a later one', async () => {
    const { doctor, slot } = await seedBasicDoctorWithSlot({ maximumCapacity: 10 });
    const patient = await prisma.patient.create({ data: { name: 'Repeat Visitor', phone: '9876543210' } });
    const make = (extra: object) => request(app).post('/api/tokens').send({ doctorId: doctor.id, slotId: slot.id, source: 'ONLINE', ...extra });

    const first = await make({ patientId: patient.id });
    expect(first.status).toBe(201);
    const second = await make({ patientId: patient.id });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('DUPLICATE_TOKEN');
    expect(second.body.error.message).toContain(first.body.tokenNumber);

    // after the first ticket ends, the same patient can have another
    await request(app).post(`/api/tokens/${first.body.id}/cancel`).expect(200);
    expect((await make({ patientId: patient.id })).status).toBe(201);
  });

  it('spots a repeat walk-in by name and phone together, but not by name alone', async () => {
    const { doctor, slot } = await seedBasicDoctorWithSlot({ maximumCapacity: 10 });
    const make = (patientName: string, patientPhone?: string) =>
      request(app).post('/api/tokens').send({ doctorId: doctor.id, slotId: slot.id, source: 'WALK_IN', patientName, patientPhone });

    expect((await make('Rahul Verma', '9876501234')).status).toBe(201);
    expect((await make('rahul verma', '9876501234')).status).toBe(409);
    expect((await make('Rahul Verma', '9000000001')).status).toBe(201);
    expect((await make('Rahul Verma')).status).toBe(201);
    expect((await make('Rahul Verma')).status).toBe(201);
  });
});
