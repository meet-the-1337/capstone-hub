import { Request, Response, NextFunction } from 'express';
import { BacklogService } from '../services/backlog.service';
import { UserStoryStatus } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';

export class BacklogController {
  /**
   * Get product backlog for a project.
   */
  public static async getProjectBacklog(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const projectId = req.params.projectId || (req.query.projectId as string);
      const status = req.query.status as UserStoryStatus | undefined;
      const priority = req.query.priority as any;
      const backlog = await BacklogService.getProjectBacklog(projectId, { status, priority }, req.user);
      res.status(200).json({
        success: true,
        data: backlog,
      });
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ success: false, error: error.message });
        return;
      }
      next(error);
    }
  }

  /**
   * Add a user story to a project's backlog.
   */
  public static async addStoryToBacklog(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const projectId = req.params.projectId || req.body.projectId;
      const story = await BacklogService.addStoryToBacklog(projectId, req.body, req.user);
      res.status(201).json({
        success: true,
        message: 'User story added to backlog successfully',
        data: story,
      });
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ success: false, error: error.message });
        return;
      }
      next(error);
    }
  }

  /**
   * Reorder user stories in a project's backlog.
   */
  public static async reorderBacklog(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const projectId = req.params.projectId || req.body.projectId;
      const stories = await BacklogService.reorderBacklog(projectId, req.body, req.user);
      res.status(200).json({
        success: true,
        message: 'Backlog reordered successfully',
        data: stories,
      });
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ success: false, error: error.message });
        return;
      }
      next(error);
    }
  }
}
