import type { Request, Response } from 'express';
import * as tokenRepo from '../repositories/tokenRepository.js';
import * as eventRepo from '../repositories/eventRepository.js';
import * as tokenService from '../services/tokenService.js';
import { prisma } from '../utils/prisma.js';
import { NotFoundError } from '../domain/errors.js';

export async function list(req: Request, res: Response) {
  const { doctorId, slotId, status } = req.query;
  res.json(
    await tokenRepo.listTokens(prisma, {
      doctorId: typeof doctorId === 'string' ? doctorId : undefined,
      slotId: typeof slotId === 'string' ? slotId : undefined,
      status: typeof status === 'string' ? (status as any) : undefined,
    })
  );
}

export async function create(req: Request, res: Response) {
  const token = await tokenService.createToken(req.body);
  res.status(201).json(token);
}

export async function getById(req: Request, res: Response) {
  const token = await tokenRepo.findTokenById(prisma, req.params.id);
  if (!token) throw new NotFoundError(`Token ${req.params.id} not found`);
  const events = await eventRepo.listEventsForToken(prisma, req.params.id);
  res.json({ ...token, events });
}

export async function cancel(req: Request, res: Response) {
  res.json(await tokenService.cancelToken(req.params.id));
}

export async function noShow(req: Request, res: Response) {
  res.json(await tokenService.noShowToken(req.params.id));
}

export async function call(req: Request, res: Response) {
  res.json(await tokenService.callToken(req.params.id));
}

export async function start(req: Request, res: Response) {
  res.json(await tokenService.startToken(req.params.id));
}

export async function complete(req: Request, res: Response) {
  res.json(await tokenService.completeToken(req.params.id));
}
