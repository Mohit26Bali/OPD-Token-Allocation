import type { Request, Response } from 'express';
import * as dashboardService from '../services/dashboardService.js';

export async function overview(req: Request, res: Response) {
  res.json(await dashboardService.getOverview());
}

export async function doctors(req: Request, res: Response) {
  res.json(await dashboardService.getDoctorsView());
}

export async function slots(req: Request, res: Response) {
  res.json(await dashboardService.getSlotsView());
}

export async function tokens(req: Request, res: Response) {
  res.json(await dashboardService.getTokensView());
}

export async function board(req: Request, res: Response) {
  res.json(await dashboardService.getBoard());
}

export async function activity(req: Request, res: Response) {
  const limit = Number.parseInt(String(req.query.limit ?? "40"), 10);
  res.json(await dashboardService.getRecentActivity(Number.isFinite(limit) ? limit : 40));
}
