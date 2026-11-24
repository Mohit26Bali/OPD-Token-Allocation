import { Router } from 'express';
import * as ctrl from '../controllers/slotsController.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateBody } from '../middleware/validate.js';
import { createSlotSchema, updateSlotSchema } from '../validators/schemas.js';

const router = Router();

router.get('/', asyncHandler(ctrl.list));
router.post('/', validateBody(createSlotSchema), asyncHandler(ctrl.create));
router.get('/:id', asyncHandler(ctrl.getById));
router.patch('/:id', validateBody(updateSlotSchema), asyncHandler(ctrl.update));
router.post('/:id/reallocate', asyncHandler(ctrl.reallocate));

export default router;
