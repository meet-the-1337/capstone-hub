import { Router } from 'express';
import { TraceabilityController } from '../controllers/traceability.controller';
import { authenticate } from '../middleware/auth';

const router = Router({ mergeParams: true });

// Enforce authentication for all traceability endpoints
router.use(authenticate);

// Project traceability and matrix
router.get('/project/:projectId', TraceabilityController.getProjectTraceability);
router.get('/project/:projectId/matrix', TraceabilityController.getTraceabilityMatrix);
router.get('/matrix/:projectId', TraceabilityController.getTraceabilityMatrix);

// Granular entity traceability
router.get('/requirements/:requirementId', TraceabilityController.getRequirementTraceability);
router.get('/stories/:storyId', TraceabilityController.getStoryTraceability);
router.get('/tasks/:taskId', TraceabilityController.getTaskTraceability);

// Direct root parameter shortcuts
router.get('/:projectId/matrix', TraceabilityController.getTraceabilityMatrix);
router.get('/:projectId', TraceabilityController.getProjectTraceability);

export default router;
