import { Router } from 'express';
import * as ctrl from '../controllers/simulationController.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

router.post('/run', asyncHandler(ctrl.run));
router.get('/:id', asyncHandler(ctrl.getById));

export default router;
