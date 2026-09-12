import { Router } from 'express';
import { BugController } from '../controllers/bug.controller';
import { authenticate } from '../middleware/auth';

const router = Router({ mergeParams: true });

// Enforce authentication for all bug routes
router.use(authenticate);

// Bug CRUD operations
router.post('/', BugController.createBug);
router.get('/', BugController.getBugsByProject);
router.get('/:id', BugController.getBugById);
router.put('/:id', BugController.updateBug);
router.patch('/:id', BugController.updateBug);
router.delete('/:id', BugController.deleteBug);

// Bug Traceability and linking endpoints
router.get('/:id/trace', BugController.getBugTraceability);
router.get('/:id/traceability', BugController.getBugTraceability);
router.post('/:id/trace', BugController.linkTrace);
router.put('/:id/trace', BugController.linkTrace);
router.patch('/:id/trace', BugController.linkTrace);

export default router;
