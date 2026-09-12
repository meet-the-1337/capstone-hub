import { Router } from 'express';
import { FacultyController } from '../controllers/faculty.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Faculty Dashboard endpoints
router.get('/dashboard', FacultyController.getFacultyDashboard);
router.get('/:facultyId/dashboard', FacultyController.getFacultyDashboard);

// Faculty overview endpoints
router.get('/projects', FacultyController.getOverseenProjects);
router.get('/projects/:projectId/progress', FacultyController.getProjectProgressData);
router.get('/projects/:projectId', FacultyController.getOverseenProjectDetail);

// Faculty progress endpoints
router.get('/progress', FacultyController.getAllOverseenProgressData);
router.get('/:facultyId/progress', FacultyController.getAllOverseenProgressData);
router.get('/:facultyId/projects', FacultyController.getOverseenProjects);

export default router;
