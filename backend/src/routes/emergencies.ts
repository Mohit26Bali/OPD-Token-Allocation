import { Router } from 'express';
import * as ctrl from '../controllers/emergenciesController.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateBody } from '../middleware/validate.js';
import { emergencySchema } from '../validators/schemas.js';

const router = Router();

router.post('/', validateBody(emergencySchema), asyncHandler(ctrl.create));

export default router;
