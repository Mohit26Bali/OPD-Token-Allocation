import type { TxClient } from '../utils/withTransaction.js';

export function findDoctorById(db: TxClient, id: string) {
  return db.doctor.findUnique({ where: { id } });
}

export function listDoctors(db: TxClient) {
  return db.doctor.findMany({ orderBy: { name: 'asc' } });
}

export function createDoctor(db: TxClient, data: { name: string; specialization: string }) {
  return db.doctor.create({ data });
}

export function updateDoctor(
  db: TxClient,
  id: string,
  data: Partial<{ name: string; specialization: string; active: boolean; delayMinutes: number; delayedAt: Date | null; unavailable: boolean }>
) {
  return db.doctor.update({ where: { id }, data });
}
