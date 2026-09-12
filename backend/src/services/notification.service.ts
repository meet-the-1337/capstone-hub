import { NotificationType, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

export interface CreateNotificationDTO {
  userId: string;
  title: string;
  message: string;
  type?: NotificationType;
  entityType?: string;
  entityId?: string;
  projectId?: string;
}

export interface NotifyAssignmentDTO {
  recipientId: string;
  assignerId?: string;
  entityType: string;
  entityId: string;
  entityTitle: string;
  projectId?: string;
}

export interface NotifyReviewDTO {
  recipientId: string;
  reviewerId?: string;
  entityType: string;
  entityId: string;
  entityTitle: string;
  status: string;
  feedback?: string;
  projectId?: string;
}

export interface NotifyStatusChangeDTO {
  recipientId: string;
  changerId?: string;
  entityType: string;
  entityId: string;
  entityTitle: string;
  oldStatus?: string;
  newStatus: string;
  projectId?: string;
}

export interface NotifyProjectActionDTO {
  recipientIds: string[];
  title: string;
  message: string;
  type?: NotificationType;
  entityType?: string;
  entityId?: string;
  projectId?: string;
}

export interface GetNotificationsQueryDTO {
  type?: NotificationType;
  read?: boolean;
  page?: number;
  pageSize?: number;
}

export class NotificationService {
  /**
   * Helper to verify if a user has access to a project.
   */
  private static canAccessProject(
    user: { id: string; role: Role },
    project: {
      id: string;
      facultyId: string | null;
      teamId: string | null;
      team: {
        leadId: string | null;
        members: { userId: string; role: Role }[];
      } | null;
    }
  ): boolean {
    if (user.role === Role.FACULTY || project.facultyId === user.id) {
      return true;
    }

    if (!project.team) {
      return false;
    }

    return (
      project.team.leadId === user.id ||
      project.team.members.some((m) => m.userId === user.id)
    );
  }

  /**
   * Create a single notification for a specific recipient.
   */
  public static async createNotification(data: CreateNotificationDTO) {
    if (!data.userId || typeof data.userId !== 'string' || !data.userId.trim()) {
      throw new AppError('Recipient user ID is required', 400);
    }
    if (!data.title || typeof data.title !== 'string' || !data.title.trim()) {
      throw new AppError('Notification title is required', 400);
    }
    if (!data.message || typeof data.message !== 'string' || !data.message.trim()) {
      throw new AppError('Notification message is required', 400);
    }

    let notificationType: NotificationType = NotificationType.GENERAL;
    if (data.type !== undefined) {
      if (!Object.values(NotificationType).includes(data.type)) {
        throw new AppError(
          `Invalid notification type. Allowed: ${Object.values(NotificationType).join(', ')}`,
          400
        );
      }
      notificationType = data.type;
    }

    return prisma.notification.create({
      data: {
        userId: data.userId.trim(),
        title: data.title.trim(),
        message: data.message.trim(),
        type: notificationType,
        entityType: data.entityType?.trim() || null,
        entityId: data.entityId?.trim() || null,
        projectId: data.projectId?.trim() || null,
      },
    });
  }

  /**
   * Create multiple notifications simultaneously (e.g. broadcasting to team members).
   */
  public static async createBulkNotifications(notifications: CreateNotificationDTO[]) {
    if (!Array.isArray(notifications) || notifications.length === 0) {
      throw new AppError('Notifications list must be a non-empty array', 400);
    }

    const validData = notifications.map((item, index) => {
      if (!item.userId || typeof item.userId !== 'string' || !item.userId.trim()) {
        throw new AppError(`Recipient user ID is required at index ${index}`, 400);
      }
      if (!item.title || typeof item.title !== 'string' || !item.title.trim()) {
        throw new AppError(`Notification title is required at index ${index}`, 400);
      }
      if (!item.message || typeof item.message !== 'string' || !item.message.trim()) {
        throw new AppError(`Notification message is required at index ${index}`, 400);
      }

      let nType: NotificationType = NotificationType.GENERAL;
      if (item.type !== undefined) {
        if (!Object.values(NotificationType).includes(item.type)) {
          throw new AppError(`Invalid notification type at index ${index}`, 400);
        }
        nType = item.type;
      }

      return {
        userId: item.userId.trim(),
        title: item.title.trim(),
        message: item.message.trim(),
        type: nType,
        entityType: item.entityType?.trim() || null,
        entityId: item.entityId?.trim() || null,
        projectId: item.projectId?.trim() || null,
      };
    });

    return prisma.$transaction(
      validData.map((d) => prisma.notification.create({ data: d }))
    );
  }

  /**
   * Dispatch an assignment notification.
   */
  public static async notifyAssignment(data: NotifyAssignmentDTO) {
    if (!data.recipientId || !data.recipientId.trim()) {
      throw new AppError('Recipient user ID is required', 400);
    }
    if (!data.entityType || !data.entityType.trim()) {
      throw new AppError('Entity type is required', 400);
    }
    if (!data.entityId || !data.entityId.trim()) {
      throw new AppError('Entity ID is required', 400);
    }
    if (!data.entityTitle || !data.entityTitle.trim()) {
      throw new AppError('Entity title is required', 400);
    }

    const title = `New Assignment: ${data.entityType.trim()}`;
    const message = `You have been assigned to ${data.entityType.trim()} "${data.entityTitle.trim()}".`;

    return this.createNotification({
      userId: data.recipientId.trim(),
      title,
      message,
      type: NotificationType.ASSIGNMENT,
      entityType: data.entityType.trim(),
      entityId: data.entityId.trim(),
      projectId: data.projectId?.trim() || undefined,
    });
  }

  /**
   * Dispatch a review notification (e.g. requirement or deliverable review).
   */
  public static async notifyReview(data: NotifyReviewDTO) {
    if (!data.recipientId || !data.recipientId.trim()) {
      throw new AppError('Recipient user ID is required', 400);
    }
    if (!data.entityType || !data.entityType.trim()) {
      throw new AppError('Entity type is required', 400);
    }
    if (!data.entityId || !data.entityId.trim()) {
      throw new AppError('Entity ID is required', 400);
    }
    if (!data.entityTitle || !data.entityTitle.trim()) {
      throw new AppError('Entity title is required', 400);
    }
    if (!data.status || !data.status.trim()) {
      throw new AppError('Review status is required', 400);
    }

    const title = `Review Update: ${data.entityType.trim()} ${data.status.trim()}`;
    let message = `Your ${data.entityType.trim()} "${data.entityTitle.trim()}" has been ${data.status.trim().toLowerCase()}.`;
    if (data.feedback && data.feedback.trim()) {
      message += ` Feedback: ${data.feedback.trim()}`;
    }

    return this.createNotification({
      userId: data.recipientId.trim(),
      title,
      message,
      type: NotificationType.REVIEW,
      entityType: data.entityType.trim(),
      entityId: data.entityId.trim(),
      projectId: data.projectId?.trim() || undefined,
    });
  }

  /**
   * Dispatch a status change notification.
   */
  public static async notifyStatusChange(data: NotifyStatusChangeDTO) {
    if (!data.recipientId || !data.recipientId.trim()) {
      throw new AppError('Recipient user ID is required', 400);
    }
    if (!data.entityType || !data.entityType.trim()) {
      throw new AppError('Entity type is required', 400);
    }
    if (!data.entityId || !data.entityId.trim()) {
      throw new AppError('Entity ID is required', 400);
    }
    if (!data.entityTitle || !data.entityTitle.trim()) {
      throw new AppError('Entity title is required', 400);
    }
    if (!data.newStatus || !data.newStatus.trim()) {
      throw new AppError('New status is required', 400);
    }

    const title = `Status Updated: ${data.entityType.trim()}`;
    const message = `Status of ${data.entityType.trim()} "${data.entityTitle.trim()}" was changed to ${data.newStatus.trim()}.`;

    return this.createNotification({
      userId: data.recipientId.trim(),
      title,
      message,
      type: NotificationType.STATUS_CHANGE,
      entityType: data.entityType.trim(),
      entityId: data.entityId.trim(),
      projectId: data.projectId?.trim() || undefined,
    });
  }

  /**
   * Dispatch a project action notification to multiple recipients.
   */
  public static async notifyProjectAction(data: NotifyProjectActionDTO) {
    if (!Array.isArray(data.recipientIds) || data.recipientIds.length === 0) {
      throw new AppError('Recipient user IDs list must be non-empty', 400);
    }
    if (!data.title || !data.title.trim()) {
      throw new AppError('Notification title is required', 400);
    }
    if (!data.message || !data.message.trim()) {
      throw new AppError('Notification message is required', 400);
    }

    const uniqueRecipients = Array.from(new Set(data.recipientIds.map((id) => id.trim())));
    const dtos: CreateNotificationDTO[] = uniqueRecipients.map((uid) => ({
      userId: uid,
      title: data.title.trim(),
      message: data.message.trim(),
      type: data.type || NotificationType.GENERAL,
      entityType: data.entityType?.trim() || undefined,
      entityId: data.entityId?.trim() || undefined,
      projectId: data.projectId?.trim() || undefined,
    }));

    return this.createBulkNotifications(dtos);
  }

  /**
   * Retrieve notifications for a specific user with pagination & optional filtering.
   */
  public static async getUserNotifications(
    userId: string,
    query?: GetNotificationsQueryDTO
  ) {
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      throw new AppError('User ID is required', 400);
    }

    const where: {
      userId: string;
      type?: NotificationType;
      read?: boolean;
    } = {
      userId: userId.trim(),
    };

    if (query?.type) {
      if (!Object.values(NotificationType).includes(query.type)) {
        throw new AppError(
          `Invalid notification type. Allowed: ${Object.values(NotificationType).join(', ')}`,
          400
        );
      }
      where.type = query.type;
    }

    if (query?.read !== undefined) {
      where.read = Boolean(query.read);
    }

    const page = query?.page && query.page > 0 ? query.page : 1;
    const pageSize = query?.pageSize && query.pageSize > 0 ? query.pageSize : 20;
    const skip = (page - 1) * pageSize;

    const [totalCount, unreadCount, notifications] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId: userId.trim(), read: false } }),
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    return {
      totalCount,
      unreadCount,
      page,
      pageSize,
      notifications,
    };
  }

  /**
   * Retrieve a specific notification by ID.
   */
  public static async getNotificationById(
    notificationId: string,
    user: { id: string; role: Role }
  ) {
    if (!notificationId || typeof notificationId !== 'string' || !notificationId.trim()) {
      throw new AppError('Notification ID is required', 400);
    }

    const notification = await prisma.notification.findUnique({
      where: { id: notificationId.trim() },
    });

    if (!notification) {
      throw new AppError('Notification not found', 404);
    }

    if (notification.userId !== user.id && user.role !== Role.FACULTY) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    return notification;
  }

  /**
   * Delete a notification by ID.
   */
  public static async deleteNotification(
    notificationId: string,
    user: { id: string; role: Role }
  ) {
    if (!notificationId || typeof notificationId !== 'string' || !notificationId.trim()) {
      throw new AppError('Notification ID is required', 400);
    }

    const notification = await prisma.notification.findUnique({
      where: { id: notificationId.trim() },
    });

    if (!notification) {
      throw new AppError('Notification not found', 404);
    }

    if (notification.userId !== user.id && user.role !== Role.FACULTY) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    await prisma.notification.delete({
      where: { id: notification.id },
    });

    return { message: 'Notification deleted successfully' };
  }

  /**
   * Mark a single notification as read.
   */
  public static async markAsRead(
    notificationId: string,
    user: { id: string; role: Role }
  ) {
    if (!notificationId || typeof notificationId !== 'string' || !notificationId.trim()) {
      throw new AppError('Notification ID is required', 400);
    }

    const notification = await prisma.notification.findUnique({
      where: { id: notificationId.trim() },
    });

    if (!notification) {
      throw new AppError('Notification not found', 404);
    }

    if (notification.userId !== user.id && user.role !== Role.FACULTY) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    return prisma.notification.update({
      where: { id: notification.id },
      data: {
        read: true,
        readAt: new Date(),
      },
    });
  }

  /**
   * Mark a single notification as unread.
   */
  public static async markAsUnread(
    notificationId: string,
    user: { id: string; role: Role }
  ) {
    if (!notificationId || typeof notificationId !== 'string' || !notificationId.trim()) {
      throw new AppError('Notification ID is required', 400);
    }

    const notification = await prisma.notification.findUnique({
      where: { id: notificationId.trim() },
    });

    if (!notification) {
      throw new AppError('Notification not found', 404);
    }

    if (notification.userId !== user.id && user.role !== Role.FACULTY) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    return prisma.notification.update({
      where: { id: notification.id },
      data: {
        read: false,
        readAt: null,
      },
    });
  }

  /**
   * Mark all unread notifications as read for a user.
   */
  public static async markAllAsRead(userId: string) {
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      throw new AppError('User ID is required', 400);
    }

    const result = await prisma.notification.updateMany({
      where: {
        userId: userId.trim(),
        read: false,
      },
      data: {
        read: true,
        readAt: new Date(),
      },
    });

    return {
      count: result.count,
      message: 'All notifications marked as read',
    };
  }

  /**
   * Retrieve unread notifications count for a user.
   */
  public static async getUnreadCount(userId: string) {
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      throw new AppError('User ID is required', 400);
    }

    const unreadCount = await prisma.notification.count({
      where: {
        userId: userId.trim(),
        read: false,
      },
    });

    return { unreadCount };
  }

  /**
   * Retrieve all notifications for a specific project (e.g. for team audit/monitoring).
   */
  public static async getProjectNotifications(
    projectId: string,
    user: { id: string; role: Role },
    query?: GetNotificationsQueryDTO
  ) {
    if (!projectId || typeof projectId !== 'string' || !projectId.trim()) {
      throw new AppError('Project ID is required', 400);
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId.trim() },
      include: { team: { include: { members: true } } },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    if (!this.canAccessProject(user, project)) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    const where: {
      projectId: string;
      type?: NotificationType;
    } = {
      projectId: project.id,
    };

    if (query?.type) {
      if (!Object.values(NotificationType).includes(query.type)) {
        throw new AppError(
          `Invalid notification type. Allowed: ${Object.values(NotificationType).join(', ')}`,
          400
        );
      }
      where.type = query.type;
    }

    const page = query?.page && query.page > 0 ? query.page : 1;
    const pageSize = query?.pageSize && query.pageSize > 0 ? query.pageSize : 20;
    const skip = (page - 1) * pageSize;

    const [totalCount, notifications] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    return {
      projectId: project.id,
      totalCount,
      page,
      pageSize,
      notifications,
    };
  }
}
