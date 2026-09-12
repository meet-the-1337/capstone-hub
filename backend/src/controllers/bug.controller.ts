import { Request, Response, NextFunction } from 'express';
import { BugService } from '../services/bug.service';
import { AppError } from '../middleware/errorHandler';

export class BugController {
  public static async createBug(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const projectId = req.params.projectId || req.body.projectId;
      const bug = await BugService.createBug(
        {
          ...req.body,
          projectId,
        },
        req.user
      );

      res.status(201).json({
        success: true,
        message: 'Bug reported successfully',
        data: bug,
      });
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ success: false, error: error.message });
        return;
      }
      next(error);
    }
  }

  public static async getBugsByProject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const projectId = req.params.projectId || (req.query.projectId as string);
      const filters = {
        status: req.query.status as any,
        priority: req.query.priority as any,
        severity: req.query.severity as any,
        requirementId: req.query.requirementId as string,
        userStoryId: req.query.userStoryId as string,
        taskId: req.query.taskId as string,
        sprintId: req.query.sprintId as string,
        assigneeId: req.query.assigneeId as string,
      };

      const bugs = await BugService.getBugsByProject(projectId, req.user, filters);

      res.status(200).json({
        success: true,
        data: bugs,
      });
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ success: false, error: error.message });
        return;
      }
      next(error);
    }
  }

  public static async getBugById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const bugId = req.params.id || req.params.bugId;
      const bug = await BugService.getBugById(bugId, req.user);

      res.status(200).json({
        success: true,
        data: bug,
      });
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ success: false, error: error.message });
        return;
      }
      next(error);
    }
  }

  public static async updateBug(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const bugId = req.params.id || req.params.bugId;
      const updatedBug = await BugService.updateBug(bugId, req.body, req.user);

      res.status(200).json({
        success: true,
        message: 'Bug updated successfully',
        data: updatedBug,
      });
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ success: false, error: error.message });
        return;
      }
      next(error);
    }
  }

  public static async deleteBug(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const bugId = req.params.id || req.params.bugId;
      const result = await BugService.deleteBug(bugId, req.user);

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

  public static async linkTrace(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const bugId = req.params.id || req.params.bugId;
      const updatedBug = await BugService.updateBug(bugId, req.body, req.user);

      res.status(200).json({
        success: true,
        message: 'Bug trace updated successfully',
        data: updatedBug,
      });
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ success: false, error: error.message });
        return;
      }
      next(error);
    }
  }

  public static async getBugTraceability(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const bugId = req.params.id || req.params.bugId;
      const trace = await BugService.getBugTraceability(bugId, req.user);

      res.status(200).json({
        success: true,
        data: trace,
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
