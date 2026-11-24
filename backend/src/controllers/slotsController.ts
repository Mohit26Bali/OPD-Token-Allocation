import type { Request, Response } from 'express';
import * as slotService from '../services/slotService.js';
import { NotFoundError } from '../domain/errors.js';

export async function list(req: Request, res: Response) {
  const doctorId = typeof req.query.doctorId === 'string' ? req.query.doctorId : undefined;
  res.json(await slotService.listSlots({ doctorId }));
}

export async function create(req: Request, res: Response) {
  const slot = await slotService.createSlot(req.body);
  res.status(201).json(slot);
}

export async function getById(req: Request, res: Response) {
  const slot = await slotService.getSlot(req.params.id);
  if (!slot) throw new NotFoundError(`Slot ${req.params.id} not found`);
  res.json(slot);
}

export async function update(req: Request, res: Response) {
  const { maximumCapacity, status } = req.body;
  let result: unknown = null;
  if (typeof maximumCapacity === 'number') {
    result = await slotService.updateSlotCapacity(req.params.id, maximumCapacity);
  }
  if (status) {
    result = await slotService.updateSlotStatus(req.params.id, status);
  }
  res.json(result ?? (await slotService.getSlot(req.params.id)));
}

export async function reallocate(req: Request, res: Response) {
  const result = await slotService.reallocateSlot(req.params.id);
  res.json(result);
}
