import { Router } from 'express';
import * as ctrl from '../controllers/tokensController.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateBody } from '../middleware/validate.js';
import { createTokenSchema } from '../validators/schemas.js';

const router = Router();

router.get('/', asyncHandler(ctrl.list));
router.post('/', validateBody(createTokenSchema), asyncHandler(ctrl.create));
router.get('/:id', asyncHandler(ctrl.getById));
router.post('/:id/cancel', asyncHandler(ctrl.cancel));
router.post('/:id/no-show', asyncHandler(ctrl.noShow));
router.post('/:id/call', asyncHandler(ctrl.call));
router.post('/:id/start', asyncHandler(ctrl.start));
router.post('/:id/complete', asyncHandler(ctrl.complete));

export default router;
