import type { Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import * as doctorRepo from '../repositories/doctorRepository.js';
import * as doctorService from '../services/doctorService.js';
import { NotFoundError } from '../domain/errors.js';

export async function list(req: Request, res: Response) {
  res.json(await doctorRepo.listDoctors(prisma));
}

export async function create(req: Request, res: Response) {
  const doctor = await doctorRepo.createDoctor(prisma, req.body);
  res.status(201).json(doctor);
}

export async function getById(req: Request, res: Response) {
  const doctor = await doctorRepo.findDoctorById(prisma, req.params.id);
  if (!doctor) throw new NotFoundError(`Doctor ${req.params.id} not found`);
  res.json(doctor);
}

export async function update(req: Request, res: Response) {
  const doctor = await doctorRepo.updateDoctor(prisma, req.params.id, req.body);
  res.json(doctor);
}

export async function delay(req: Request, res: Response) {
  const result = await doctorService.delayDoctor(req.params.id, req.body.delayMinutes);
  res.json(result);
}

export async function markUnavailable(req: Request, res: Response) {
  const result = await doctorService.setDoctorUnavailable(req.params.id, req.body.reason);
  res.json(result);
}

export async function markAvailable(req: Request, res: Response) {
  const result = await doctorService.setDoctorAvailable(req.params.id);
  res.json(result);
}
