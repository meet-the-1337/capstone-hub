import { Request, Response, NextFunction } from 'express';
import { RequirementService } from '../services/requirement.service';
import { RequirementPriority, RequirementStatus, RequirementType } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';

export class RequirementController {
  /**
   * Create a requirement for a project.
   */
  public static async createRequirement(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const projectId = req.params.projectId || req.body.projectId;
      const requirement = await RequirementService.createRequirement(projectId, req.body, req.user);
      res.status(201).json({
        success: true,
        message: 'Requirement created successfully',
        data: requirement,
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
   * Get all requirements for a project with optional filters.
   */
  public static async getRequirements(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const { projectId } = req.params;
      const type = req.query.type as RequirementType | undefined;
      const priority = req.query.priority as RequirementPriority | undefined;
      const status = req.query.status as RequirementStatus | undefined;
      const requirements = await RequirementService.getRequirementsByProjectId(
        projectId,
        { type, priority, status },
        req.user
      );
      res.status(200).json({
        success: true,
        data: requirements,
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
   * Get requirement by ID.
   */
  public static async getRequirementById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const { id } = req.params;
      const requirement = await RequirementService.getRequirementById(id, req.user);
      res.status(200).json({
        success: true,
        data: requirement,
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
   * Update requirement by ID.
   */
  public static async updateRequirement(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const { id } = req.params;
      const requirement = await RequirementService.updateRequirement(id, req.body, req.user);
      res.status(200).json({
        success: true,
        message: 'Requirement updated successfully',
        data: requirement,
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
   * Delete requirement by ID.
   */
  public static async deleteRequirement(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const { id } = req.params;
      const result = await RequirementService.deleteRequirement(id, req.user);
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

  /**
   * Get all version snapshots of a requirement.
   */
  public static async getRequirementVersions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const { id } = req.params;
      const versions = await RequirementService.getRequirementVersions(id, req.user);
      res.status(200).json({
        success: true,
        data: versions,
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
   * Get a specific version snapshot of a requirement by version number.
   */
  public static async getRequirementVersionByNumber(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const { id, versionNumber } = req.params;
      const version = await RequirementService.getRequirementVersionByNumber(
        id,
        parseInt(versionNumber, 10),
        req.user
      );
      res.status(200).json({
        success: true,
        data: version,
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
   * Submit a requirement for faculty review.
   */
  public static async submitRequirement(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const { id } = req.params;
      const requirement = await RequirementService.submitRequirement(id, req.user);
      res.status(200).json({
        success: true,
        message: 'Requirement submitted for review successfully',
        data: requirement,
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
   * Review a requirement (approve or reject with optional feedback).
   */
  public static async reviewRequirement(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const { id } = req.params;
      const requirement = await RequirementService.reviewRequirement(id, req.body, req.user);
      res.status(200).json({
        success: true,
        message: 'Requirement reviewed successfully',
        data: requirement,
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
   * Approve a requirement.
   */
  public static async approveRequirement(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const { id } = req.params;
      const requirement = await RequirementService.approveRequirement(id, req.body?.feedback, req.user);
      res.status(200).json({
        success: true,
        message: 'Requirement approved successfully',
        data: requirement,
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
   * Reject a requirement.
   */
  public static async rejectRequirement(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const { id } = req.params;
      const requirement = await RequirementService.rejectRequirement(id, req.body?.feedback, req.user);
      res.status(200).json({
        success: true,
        message: 'Requirement rejected successfully',
        data: requirement,
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
   * Link a requirement to a user story.
   */
  public static async linkUserStory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const requirementId = req.params.id || req.params.requirementId;
      const userStoryId = req.params.storyId || req.body.userStoryId || req.body.storyId;
      const result = await RequirementService.linkUserStory(requirementId, userStoryId, req.user);

      res.status(200).json({
        success: true,
        message: result.message,
        data: result,
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
   * Unlink a requirement from a user story.
   */
  public static async unlinkUserStory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const requirementId = req.params.id || req.params.requirementId;
      const userStoryId = req.params.storyId || req.body.userStoryId || req.body.storyId;
      const result = await RequirementService.unlinkUserStory(requirementId, userStoryId, req.user);

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

  /**
   * Get all user stories linked to a requirement.
   */
  public static async getLinkedStories(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const requirementId = req.params.id || req.params.requirementId;
      const result = await RequirementService.getLinkedStories(requirementId, req.user);

      res.status(200).json({
        success: true,
        data: result,
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
   * Get all requirements linked to a user story.
   */
  public static async getLinkedRequirementsForStory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const storyId = req.params.id || req.params.storyId;
      const result = await RequirementService.getLinkedRequirementsForStory(storyId, req.user);

      res.status(200).json({
        success: true,
        data: result,
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

