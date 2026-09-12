import { Router } from 'express';
import { FacultyController } from '../controllers/faculty.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Faculty overview endpoints
router.get('/projects', FacultyController.getOverseenProjects);
router.get('/projects/:projectId', FacultyController.getOverseenProjectDetail);
router.get('/:facultyId/projects', FacultyController.getOverseenProjects);

export default router;
