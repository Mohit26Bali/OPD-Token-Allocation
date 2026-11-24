import type { Request, Response } from 'express';
import * as simulationService from '../services/simulationService.js';
import { DomainError, NotFoundError } from '../domain/errors.js';

/**
 * The demo day REPLACES everything in the database (doctors, slots, patients, tokens) with a scripted scenario, so it is
 * guarded twice: it is off in production unless ENABLE_SIMULATION=1, and a request must say it knows what it is doing.
 */
export async function run(req: Request, res: Response) {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_SIMULATION !== '1') {
    throw new DomainError('The demo simulation is switched off on this server.', 'FORBIDDEN');
  }
  if (req.body?.confirm !== 'replace-all-data') {
    throw new DomainError('The demo simulation replaces all data. Send {"confirm":"replace-all-data"} to run it.', 'VALIDATION');
  }
  const result = await simulationService.runDemoDaySimulation();
  res.status(201).json(result);
}

export async function getById(req: Request, res: Response) {
  const result = simulationService.getSimulationRun(req.params.id);
  if (!result) throw new NotFoundError(`Simulation run ${req.params.id} not found`);
  res.json(result);
}
