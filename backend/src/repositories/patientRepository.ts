import type { TxClient } from '../utils/withTransaction.js';

export function createPatient(db: TxClient, data: { name: string; phone?: string }) {
  return db.patient.create({ data });
}

export function findPatientById(db: TxClient, id: string) {
  return db.patient.findUnique({ where: { id } });
}
