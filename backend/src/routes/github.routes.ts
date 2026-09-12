import { Router } from 'express';
import { GitHubController } from '../controllers/github.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// GitHub connection routes
router.post('/connect', GitHubController.connectRepository);
router.post('/:projectId/connect', GitHubController.connectRepository);
router.delete('/:projectId/disconnect', GitHubController.disconnectRepository);
router.get('/:projectId/connection', GitHubController.getConnection);

// GitHub metadata routes
router.get('/:projectId/metadata', GitHubController.getRepoMetadata);
router.get('/:projectId/repo', GitHubController.getRepoMetadata);

export default router;
