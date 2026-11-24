import { Router } from 'express';
import * as ctrl from '../controllers/dashboardController.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

router.get('/overview', asyncHandler(ctrl.overview));
router.get('/doctors', asyncHandler(ctrl.doctors));
router.get('/slots', asyncHandler(ctrl.slots));
router.get('/tokens', asyncHandler(ctrl.tokens));
router.get('/board', asyncHandler(ctrl.board));
router.get('/activity', asyncHandler(ctrl.activity));

export default router;
