import { Router } from 'express';
import { SprintController } from '../controllers/sprint.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// Enforce authentication for all sprint routes
router.use(authenticate);

// Sprint CRUD (assuming /api/sprints/:id is routed here for individual operations)
router.get('/:id', SprintController.getSprintById);
router.put('/:id', SprintController.updateSprint);
router.patch('/:id', SprintController.updateSprint);
router.delete('/:id', SprintController.deleteSprint);
router.post('/:id/stories', SprintController.assignStories);
router.get('/:id/board', SprintController.getSprintBoard);

export default router;
