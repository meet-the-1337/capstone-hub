import { Request, Response, NextFunction } from 'express';
import { TaskService } from '../services/task.service';
import { AppError } from '../middleware/errorHandler';

export class TaskController {
  public static async createTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const { storyId } = req.params;
      const task = await TaskService.createTask(storyId, req.body, req.user);
      res.status(201).json({ success: true, message: 'Task created successfully', data: task });
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ success: false, error: error.message });
        return;
      }
      next(error);
    }
  }

  public static async getTasksByUserStory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const { storyId } = req.params;
      const tasks = await TaskService.getTasksByUserStory(storyId, req.user);
      res.status(200).json({ success: true, data: tasks });
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ success: false, error: error.message });
        return;
      }
      next(error);
    }
  }

  public static async getTaskById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const { id } = req.params;
      const task = await TaskService.getTaskById(id, req.user);
      res.status(200).json({ success: true, data: task });
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ success: false, error: error.message });
        return;
      }
      next(error);
    }
  }

  public static async updateTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const { id } = req.params;
      const task = await TaskService.updateTask(id, req.body, req.user);
      res.status(200).json({ success: true, message: 'Task updated successfully', data: task });
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ success: false, error: error.message });
        return;
      }
      next(error);
    }
  }

  public static async deleteTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const { id } = req.params;
      const result = await TaskService.deleteTask(id, req.user);
      res.status(200).json({ success: true, message: result.message });
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ success: false, error: error.message });
        return;
      }
      next(error);
    }
  }

  /**
   * Link or move task to another user story.
   */
  public static async linkTaskToStory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const taskId = req.params.id || req.params.taskId;
      const targetStoryId = req.params.storyId || req.body.storyId || req.body.userStoryId;
      const result = await TaskService.linkTaskToStory(taskId, targetStoryId, req.user);

      res.status(200).json({
        success: true,
        message: result.message,
        data: result.task,
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
   * Get the parent user story for a task.
   */
  public static async getStoryByTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const taskId = req.params.id || req.params.taskId;
      const result = await TaskService.getStoryByTask(taskId, req.user);

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
   * Link task directly to a sprint.
   */
  public static async linkTaskToSprint(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const taskId = req.params.id || req.params.taskId;
      const sprintId = req.body.sprintId || req.params.sprintId;
      const result = await TaskService.linkTaskToSprint(taskId, sprintId, req.user);

      res.status(200).json({
        success: true,
        message: result.message,
        data: result.task,
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
   * Unlink task from its sprint.
   */
  public static async unlinkTaskFromSprint(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const taskId = req.params.id || req.params.taskId;
      const result = await TaskService.unlinkTaskFromSprint(taskId, req.user);

      res.status(200).json({
        success: true,
        message: result.message,
        data: result.task,
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
   * Get the sprint for a task.
   */
  public static async getSprintByTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const taskId = req.params.id || req.params.taskId;
      const result = await TaskService.getSprintByTask(taskId, req.user);

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
