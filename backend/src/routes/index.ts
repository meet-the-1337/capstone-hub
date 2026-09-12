import { Router } from 'express';
import healthRoutes from './health.routes';
import authRoutes from './auth.routes';
import projectRoutes from './project.routes';
import milestoneRoutes from './milestone.routes';
import requirementRoutes from './requirement.routes';
import userStoryRoutes from './userStory.routes';
import backlogRoutes from './backlog.routes';
import sprintRoutes from './sprint.routes';
import taskRoutes from './task.routes';

const apiRouter = Router();

apiRouter.use('/health', healthRoutes);
apiRouter.use('/auth', authRoutes);
apiRouter.use('/projects', projectRoutes);
apiRouter.use('/milestones', milestoneRoutes);
apiRouter.use('/requirements', requirementRoutes);
apiRouter.use('/stories', userStoryRoutes);
apiRouter.use('/user-stories', userStoryRoutes);
apiRouter.use('/backlog', backlogRoutes);
apiRouter.use('/product-backlog', backlogRoutes);
apiRouter.use('/sprints', sprintRoutes);
apiRouter.use('/tasks', taskRoutes);

export default apiRouter;
