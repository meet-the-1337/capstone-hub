import { Request, Response, NextFunction } from 'express';
import { ProjectService } from '../services/project.service';
import { AppError } from '../middleware/errorHandler';

export class ProjectController {
  public static async createProject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, description, teamId } = req.body;

      if (!name) {
        res.status(400).json({ success: false, error: 'Project name is required' });
        return;
      }

      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const project = await ProjectService.createProject({ name, description, teamId }, req.user);

      res.status(201).json({
        success: true,
        message: 'Project created successfully',
        data: project,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getProjects(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const projects = await ProjectService.getProjects();
      res.status(200).json({
        success: true,
        data: projects,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getProjectById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const project = await ProjectService.getProjectById(id);

      res.status(200).json({
        success: true,
        data: project,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Project not found') {
        res.status(404).json({ success: false, error: error.message });
        return;
      }
      next(error);
    }
  }

  public static async updateProject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const { id } = req.params;
      const project = await ProjectService.updateProject(id, req.body, req.user);

      res.status(200).json({
        success: true,
        message: 'Project updated successfully',
        data: project,
      });
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          error: error.message,
          message: error.message,
        });
        return;
      }
      next(error);
    }
  }

  /**
   * Add a team member to a project's team.
   * Expects JSON body: { userId: string, role?: Role }
   */
  public static async addTeamMember(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const { id: projectId } = req.params;
      const { userId, role } = req.body;
      const member = await ProjectService.addTeamMember(projectId, { userId, role }, req.user);
      res.status(201).json({ success: true, data: member });
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ success: false, error: error.message });
        return;
      }
      next(error);
    }
  }

  /**
   * Remove a team member from a project's team.
   * URL param `userId` identifies the member to remove.
   */
  public static async removeTeamMember(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const { id: projectId, userId: memberUserId } = req.params;
      const result = await ProjectService.removeTeamMember(projectId, memberUserId, req.user);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ success: false, error: error.message });
        return;
      }
      next(error);
    }
  }

  /**
   * Get team members of a project with optional pagination.
   * Query params: page, pageSize
   */
  public static async getTeamMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id: projectId } = req.params;
      const page = req.query.page ? Number(req.query.page) : undefined;
      const pageSize = req.query.pageSize ? Number(req.query.pageSize) : undefined;
      const result = await ProjectService.getTeamMembers(projectId, { page, pageSize });
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ success: false, error: error.message });
        return;
      }
      next(error);
    }
  }

  /**
   * Update the role of a team member in a project's team.
   * Expects JSON body: { role: Role }
   */
  public static async updateMemberRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const { id: projectId, userId: memberUserId } = req.params;
      const { role } = req.body;
      const updatedMember = await ProjectService.updateMemberRole(
        projectId,
        memberUserId,
        { role },
        req.user
      );
      res.status(200).json({
        success: true,
        message: 'Member role updated successfully',
        data: updatedMember,
      });
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ success: false, error: error.message });
        return;
      }
      next(error);
    }
  }

  public static async getProjectBoard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const { id } = req.params;
      const board = await ProjectService.getProjectBoard(id, req.user);
      res.status(200).json({ success: true, data: board });
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ success: false, error: error.message });
        return;
      }
      next(error);
    }
  }
}
