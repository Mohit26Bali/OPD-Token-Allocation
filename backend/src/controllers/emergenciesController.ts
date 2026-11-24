import type { Request, Response } from 'express';
import * as emergencyService from '../services/emergencyService.js';

export async function create(req: Request, res: Response) {
  const result = await emergencyService.insertEmergency(req.body);
  res.status(201).json(result);
}
