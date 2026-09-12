import { Router } from 'express';
import { RequirementController } from '../controllers/requirement.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// Enforce authentication for all requirement routes
router.use(authenticate);

// Requirement versions
router.get('/:id/versions', RequirementController.getRequirementVersions);
router.get('/:id/versions/:versionNumber', RequirementController.getRequirementVersionByNumber);

// Requirement workflow & review
router.post('/:id/submit', RequirementController.submitRequirement);
router.post('/:id/review', RequirementController.reviewRequirement);
router.post('/:id/approve', RequirementController.approveRequirement);
router.post('/:id/reject', RequirementController.rejectRequirement);

// Requirement - User Story links
router.post('/:id/stories', RequirementController.linkUserStory);
router.post('/:requirementId/stories/:storyId', RequirementController.linkUserStory);
router.delete('/:id/stories/:storyId', RequirementController.unlinkUserStory);
router.delete('/:requirementId/stories/:storyId', RequirementController.unlinkUserStory);
router.get('/:id/stories', RequirementController.getLinkedStories);

// Requirement CRUD
router.post('/', RequirementController.createRequirement);
router.get('/:id', RequirementController.getRequirementById);
router.put('/:id', RequirementController.updateRequirement);
router.patch('/:id', RequirementController.updateRequirement);
router.delete('/:id', RequirementController.deleteRequirement);

export default router;
