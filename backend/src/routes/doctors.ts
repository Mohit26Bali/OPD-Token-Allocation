import { Router } from 'express';
import * as ctrl from '../controllers/doctorsController.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateBody } from '../middleware/validate.js';
import { createDoctorSchema, delayDoctorSchema, unavailableDoctorSchema, updateDoctorSchema } from '../validators/schemas.js';

const router = Router();

router.get('/', asyncHandler(ctrl.list));
router.post('/', validateBody(createDoctorSchema), asyncHandler(ctrl.create));
router.get('/:id', asyncHandler(ctrl.getById));
router.patch('/:id', validateBody(updateDoctorSchema), asyncHandler(ctrl.update));
router.post('/:id/delay', validateBody(delayDoctorSchema), asyncHandler(ctrl.delay));
router.post('/:id/unavailable', validateBody(unavailableDoctorSchema), asyncHandler(ctrl.markUnavailable));
router.post('/:id/available', asyncHandler(ctrl.markAvailable));

export default router;
