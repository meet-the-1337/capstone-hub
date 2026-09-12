import { Request, Response, NextFunction } from 'express';
import { UserStoryService } from '../services/userStory.service';
import { UserStoryStatus } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';

export class UserStoryController {
  /**
   * Create a user story for a project.
   */
  public static async createUserStory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const projectId = req.params.projectId || req.body.projectId;
      const userStory = await UserStoryService.createUserStory(projectId, req.body, req.user);
      res.status(201).json({
        success: true,
        message: 'User story created successfully',
        data: userStory,
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
   * Get all user stories for a project with optional status filtering.
   */
  public static async getUserStories(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const { projectId } = req.params;
      const status = req.query.status as UserStoryStatus | undefined;
      const priority = req.query.priority as any;
      const userStories = await UserStoryService.getUserStoriesByProjectId(
        projectId,
        { status, priority },
        req.user
      );
      res.status(200).json({
        success: true,
        data: userStories,
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
   * Get user story by ID.
   */
  public static async getUserStoryById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const { id } = req.params;
      const userStory = await UserStoryService.getUserStoryById(id, req.user);
      res.status(200).json({
        success: true,
        data: userStory,
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
   * Update user story by ID.
   */
  public static async updateUserStory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const { id } = req.params;
      const userStory = await UserStoryService.updateUserStory(id, req.body, req.user);
      res.status(200).json({
        success: true,
        message: 'User story updated successfully',
        data: userStory,
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
   * Delete user story by ID.
   */
  public static async deleteUserStory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const { id } = req.params;
      const result = await UserStoryService.deleteUserStory(id, req.user);
      res.status(200).json({
        success: true,
        message: result.message,
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
