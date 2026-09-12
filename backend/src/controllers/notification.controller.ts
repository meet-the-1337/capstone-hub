import { Request, Response, NextFunction } from 'express';
import { NotificationService } from '../services/notification.service';
import { NotificationType } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';

export class NotificationController {
  /**
   * Get notifications for the authenticated user.
   */
  public static async getUserNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const type = req.query.type as NotificationType | undefined;
      const read = req.query.read !== undefined ? req.query.read === 'true' : undefined;
      const page = req.query.page ? Number(req.query.page) : undefined;
      const pageSize = req.query.pageSize ? Number(req.query.pageSize) : undefined;

      const result = await NotificationService.getUserNotifications(req.user.id, {
        type,
        read,
        page,
        pageSize,
      });

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
   * Get notification by ID.
   */
  public static async getNotificationById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const { id } = req.params;
      const notification = await NotificationService.getNotificationById(id, req.user);
      res.status(200).json({
        success: true,
        data: notification,
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
   * Create a notification.
   */
  public static async createNotification(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const { userId, title, message, type, entityType, entityId, projectId } = req.body;
      const targetUserId = userId || req.user.id;
      const targetProjectId = req.params.projectId || projectId;

      const notification = await NotificationService.createNotification({
        userId: targetUserId,
        title,
        message,
        type,
        entityType,
        entityId,
        projectId: targetProjectId,
      });

      res.status(201).json({
        success: true,
        message: 'Notification created successfully',
        data: notification,
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
   * Delete a notification.
   */
  public static async deleteNotification(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const { id } = req.params;
      const result = await NotificationService.deleteNotification(id, req.user);
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
   * Get project notifications.
   */
  public static async getProjectNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const { projectId } = req.params;
      const type = req.query.type as NotificationType | undefined;
      const page = req.query.page ? Number(req.query.page) : undefined;
      const pageSize = req.query.pageSize ? Number(req.query.pageSize) : undefined;

      const result = await NotificationService.getProjectNotifications(projectId, req.user, {
        type,
        page,
        pageSize,
      });

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
   * Mark a single notification as read.
   */
  public static async markAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const { id } = req.params;
      const notification = await NotificationService.markAsRead(id, req.user);
      res.status(200).json({
        success: true,
        message: 'Notification marked as read',
        data: notification,
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
   * Mark a single notification as unread.
   */
  public static async markAsUnread(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const { id } = req.params;
      const notification = await NotificationService.markAsUnread(id, req.user);
      res.status(200).json({
        success: true,
        message: 'Notification marked as unread',
        data: notification,
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
   * Mark all unread notifications as read for current user.
   */
  public static async markAllAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const result = await NotificationService.markAllAsRead(req.user.id);
      res.status(200).json({
        success: true,
        message: result.message,
        data: { count: result.count },
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
   * Get unread notifications count for current user.
   */
  public static async getUnreadCount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const result = await NotificationService.getUnreadCount(req.user.id);
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
