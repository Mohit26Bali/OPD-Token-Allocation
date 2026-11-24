import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import doctorsRouter from './routes/doctors.js';
import slotsRouter from './routes/slots.js';
import tokensRouter from './routes/tokens.js';
import emergenciesRouter from './routes/emergencies.js';
import dashboardRouter from './routes/dashboard.js';
import simulationRouter from './routes/simulation.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requireApiKey } from './middleware/apiKey.js';

export interface AppOptions {
  /** Shared staff key. Required when NODE_ENV=production; when absent in development the API is open. */
  apiKey?: string | null;
  /** Web addresses allowed to call the API from a browser on another site. Empty = no cross-site access. */
  corsOrigins?: string[];
  /** Requests allowed per minute from one address. */
  rateLimitPerMinute?: number;
}

function fromEnv(): Required<AppOptions> {
  const perMinute = Number.parseInt(process.env.RATE_LIMIT_PER_MINUTE ?? '', 10);
  return {
    apiKey: process.env.API_KEY?.trim() || null,
    corsOrigins: (process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o && o !== '*'),
    rateLimitPerMinute: Number.isFinite(perMinute) && perMinute > 0 ? perMinute : 600,
  };
}

export function createApp(options: AppOptions = {}) {
  const settings = { ...fromEnv(), ...options };

  if (process.env.NODE_ENV === 'production') {
    if (!settings.apiKey || settings.apiKey.length < 16) {
      throw new Error('API_KEY must be set to a long random value (16+ characters) in production. Refusing to start without it.');
    }
  }

  const app = express();
  app.disable('x-powered-by');
  // Behind a host's proxy (Render, Railway, Nginx...) set TRUST_PROXY=1 so rate limits see the visitor, not the proxy.
  const proxies = Number.parseInt(process.env.TRUST_PROXY ?? '', 10);
  if (Number.isFinite(proxies) && proxies > 0) app.set('trust proxy', proxies);
  app.use(helmet());
  // The dashboard is served from the same address as the API (or through its dev proxy), so no cross-site access is needed.
  // It is only switched on for sites named in CORS_ORIGINS; "*" is never accepted.
  if (settings.corsOrigins.length > 0) app.use(cors({ origin: settings.corsOrigins }));
  app.use(express.json({ limit: '50kb' }));

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  const api = express.Router();
  api.use(
    rateLimit({
      windowMs: 60_000,
      limit: settings.rateLimitPerMinute,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down and try again in a minute.' } },
    })
  );
  if (settings.apiKey) api.use(requireApiKey(settings.apiKey));

  api.use('/doctors', doctorsRouter);
  api.use('/slots', slotsRouter);
  api.use('/tokens', tokensRouter);
  api.use('/emergencies', emergenciesRouter);
  api.use('/dashboard', dashboardRouter);
  api.use('/simulation', simulationRouter);
  app.use('/api', api);

  app.use((req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
  });

  app.use(errorHandler);

  return app;
}
