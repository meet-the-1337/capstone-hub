import { Router } from 'express';
import { TaskController } from '../controllers/task.controller';
import { authenticate } from '../middleware/auth';

const router = Router({ mergeParams: true });

// Enforce authentication for all task routes
router.use(authenticate);

// Individual task operations
router.get('/:id', TaskController.getTaskById);
router.put('/:id', TaskController.updateTask);
router.patch('/:id', TaskController.updateTask);
router.delete('/:id', TaskController.deleteTask);

// Task - User Story links
router.get('/:id/story', TaskController.getStoryByTask);
router.post('/:id/story', TaskController.linkTaskToStory);
router.put('/:id/story', TaskController.linkTaskToStory);
router.patch('/:id/story', TaskController.linkTaskToStory);

export default router;
