import { Request, Response, NextFunction } from 'express';
import { GitHubService } from '../services/github.service';
import { AppError } from '../middleware/errorHandler';

export class GitHubController {
  /**
   * Connect a GitHub repository to a project.
   */
  public static async connectRepository(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const projectId = req.params.projectId || req.body.projectId;
      const result = await GitHubService.connectRepository(projectId, req.body, req.user);

      res.status(200).json({
        success: true,
        message: 'GitHub repository connected successfully',
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
   * Disconnect a GitHub repository from a project.
   */
  public static async disconnectRepository(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const projectId = req.params.projectId || req.body.projectId;
      const result = await GitHubService.disconnectRepository(projectId, req.user);

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
   * Get GitHub connection for a project.
   */
  public static async getConnection(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const projectId = req.params.projectId;
      const result = await GitHubService.getConnection(projectId, req.user);

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
   * Get GitHub repository metadata for a project.
   */
  public static async getRepoMetadata(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const projectId = req.params.projectId;
      const result = await GitHubService.getRepoMetadata(projectId, req.user);

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
   * Get GitHub commits for a project repository.
   */
  public static async getRepoCommits(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const projectId = req.params.projectId;
      const result = await GitHubService.getRepoCommits(projectId, req.query, req.user);

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
   * Get GitHub branches for a project repository.
   */
  public static async getRepoBranches(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const projectId = req.params.projectId;
      const result = await GitHubService.getRepoBranches(projectId, req.query, req.user);

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
   * Get GitHub pull requests for a project repository.
   */
  public static async getRepoPullRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const projectId = req.params.projectId;
      const result = await GitHubService.getRepoPullRequests(projectId, req.query, req.user);

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
   * Get GitHub contributors for a project repository.
   */
  public static async getRepoContributors(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const projectId = req.params.projectId;
      const result = await GitHubService.getRepoContributors(projectId, req.query, req.user);

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
   * Get GitHub activity summary for a project repository.
   */
  public static async getRepoActivity(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const projectId = req.params.projectId;
      const result = await GitHubService.getRepoActivity(projectId, req.query, req.user);

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
