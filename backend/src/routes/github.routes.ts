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

// GitHub commits routes
router.get('/:projectId/commits', GitHubController.getRepoCommits);

// GitHub branches routes
router.get('/:projectId/branches', GitHubController.getRepoBranches);

// GitHub pull requests routes
router.get('/:projectId/pulls', GitHubController.getRepoPullRequests);
router.get('/:projectId/pull-requests', GitHubController.getRepoPullRequests);
router.get('/:projectId/prs', GitHubController.getRepoPullRequests);

// GitHub contributors and activity routes
router.get('/:projectId/contributors', GitHubController.getRepoContributors);
router.get('/:projectId/activity', GitHubController.getRepoActivity);

export default router;
