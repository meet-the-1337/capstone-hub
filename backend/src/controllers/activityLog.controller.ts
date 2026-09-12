import { Request, Response, NextFunction } from 'express';
import { ActivityLogService } from '../services/activityLog.service';
import { AppError } from '../middleware/errorHandler';

export class ActivityLogController {
  public static async getProjectActivityLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const { projectId } = req.params;
      const page = req.query.page ? Number(req.query.page) : undefined;
      const pageSize = req.query.pageSize ? Number(req.query.pageSize) : undefined;
      const result = await ActivityLogService.getByProject(projectId, req.user, { page, pageSize });
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ success: false, error: error.message });
        return;
      }
      next(error);
    }
  }
}
