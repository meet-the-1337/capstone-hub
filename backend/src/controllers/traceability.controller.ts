import { Request, Response, NextFunction } from 'express';
import { TraceabilityService } from '../services/traceability.service';
import { AppError } from '../middleware/errorHandler';

export class TraceabilityController {
  public static async getProjectTraceability(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const projectId = req.params.projectId || req.params.id || (req.query.projectId as string);
      const data = await TraceabilityService.getProjectTraceability(projectId, req.user);

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ success: false, error: error.message });
        return;
      }
      next(error);
    }
  }

  public static async getTraceabilityMatrix(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const projectId = req.params.projectId || req.params.id || (req.query.projectId as string);
      const data = await TraceabilityService.getTraceabilityMatrix(projectId, req.user);

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ success: false, error: error.message });
        return;
      }
      next(error);
    }
  }

  public static async getRequirementTraceability(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const requirementId = req.params.requirementId || req.params.id;
      const data = await TraceabilityService.getRequirementTraceability(requirementId, req.user);

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ success: false, error: error.message });
        return;
      }
      next(error);
    }
  }

  public static async getStoryTraceability(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const storyId = req.params.storyId || req.params.id;
      const data = await TraceabilityService.getStoryTraceability(storyId, req.user);

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ success: false, error: error.message });
        return;
      }
      next(error);
    }
  }

  public static async getTaskTraceability(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const taskId = req.params.taskId || req.params.id;
      const data = await TraceabilityService.getTaskTraceability(taskId, req.user);

      res.status(200).json({
        success: true,
        data,
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
