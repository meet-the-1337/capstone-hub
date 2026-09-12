import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Role, NotificationType } from '@prisma/client';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { config } from '../src/config';
import { NotificationService } from '../src/services/notification.service';

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    project: {
      findUnique: vi.fn(),
    },
    notification: {
      create: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

describe('Notification API & Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const generateToken = (payload: { id: string; email: string; role: Role }) => {
    return jwt.sign(payload, config.jwtSecret, { expiresIn: '1h' });
  };

  const facultyUser = {
    id: 'faculty-uuid-1',
    email: 'faculty@example.com',
    role: Role.FACULTY,
  };

  const teamLeadUser = {
    id: 'lead-uuid-1',
    email: 'lead@example.com',
    role: Role.TEAM_LEAD,
  };

  const teamMemberUser = {
    id: 'member-uuid-1',
    email: 'member@example.com',
    role: Role.TEAM_MEMBER,
  };

  const outsiderUser = {
    id: 'outsider-uuid-1',
    email: 'outsider@example.com',
    role: Role.TEAM_MEMBER,
  };

  const mockProjectWithTeam = {
    id: 'proj-uuid-1',
    name: 'Capstone Platform Project',
    facultyId: 'faculty-uuid-1',
    teamId: 'team-uuid-1',
    team: {
      id: 'team-uuid-1',
      name: 'Alpha Team',
      leadId: 'lead-uuid-1',
      members: [
        { teamId: 'team-uuid-1', userId: 'lead-uuid-1', role: Role.TEAM_LEAD },
        { teamId: 'team-uuid-1', userId: 'member-uuid-1', role: Role.TEAM_MEMBER },
      ],
    },
  };

  const mockNotification1 = {
    id: 'notif-1',
    userId: 'member-uuid-1',
    title: 'New Assignment: Task',
    message: 'You have been assigned to Task "Implement Auth".',
    type: NotificationType.ASSIGNMENT,
    entityType: 'Task',
    entityId: 'task-1',
    projectId: 'proj-uuid-1',
    read: false,
    createdAt: new Date('2026-09-12T10:00:00Z'),
    updatedAt: new Date('2026-09-12T10:00:00Z'),
  };

  const mockNotification2 = {
    id: 'notif-2',
    userId: 'member-uuid-1',
    title: 'Review Update: Requirement APPROVED',
    message: 'Your Requirement "User Login" has been approved.',
    type: NotificationType.REVIEW,
    entityType: 'Requirement',
    entityId: 'req-1',
    projectId: 'proj-uuid-1',
    read: true,
    createdAt: new Date('2026-09-12T11:00:00Z'),
    updatedAt: new Date('2026-09-12T11:00:00Z'),
  };

  describe('POST /api/notifications - Create Notification', () => {
    it('should return 401 if unauthenticated', async () => {
      const response = await request(app)
        .post('/api/notifications')
        .send({ title: 'Test', message: 'Test message' });

      expect(response.status).toBe(401);
    });

    it('should return 400 if title is missing or empty', async () => {
      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .post('/api/notifications')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: '   ', message: 'Valid message' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Notification title is required');
    });

    it('should return 400 if message is missing or empty', async () => {
      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .post('/api/notifications')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Valid title', message: '   ' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Notification message is required');
    });

    it('should return 400 if type is invalid', async () => {
      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .post('/api/notifications')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Valid title',
          message: 'Valid message',
          type: 'INVALID_TYPE',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid notification type');
    });

    it('should create notification successfully with default GENERAL type', async () => {
      const createdNotif = {
        id: 'notif-3',
        userId: 'member-uuid-1',
        title: 'General Update',
        message: 'System maintenance scheduled.',
        type: NotificationType.GENERAL,
        entityType: null,
        entityId: null,
        projectId: null,
        read: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (prisma.notification.create as any).mockResolvedValue(createdNotif);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .post('/api/notifications')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'General Update',
          message: 'System maintenance scheduled.',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe('General Update');
      expect(response.body.data.type).toBe(NotificationType.GENERAL);
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          userId: 'member-uuid-1',
          title: 'General Update',
          message: 'System maintenance scheduled.',
          type: NotificationType.GENERAL,
          entityType: null,
          entityId: null,
          projectId: null,
        },
      });
    });

    it('should create notification for another user when specified', async () => {
      const createdNotif = {
        id: 'notif-4',
        userId: 'lead-uuid-1',
        title: 'Assigned to Project',
        message: 'You have been assigned to Alpha Team.',
        type: NotificationType.ASSIGNMENT,
        entityType: 'Project',
        entityId: 'proj-uuid-1',
        projectId: 'proj-uuid-1',
        read: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (prisma.notification.create as any).mockResolvedValue(createdNotif);

      const token = generateToken(facultyUser);
      const response = await request(app)
        .post('/api/notifications')
        .set('Authorization', `Bearer ${token}`)
        .send({
          userId: 'lead-uuid-1',
          title: 'Assigned to Project',
          message: 'You have been assigned to Alpha Team.',
          type: NotificationType.ASSIGNMENT,
          entityType: 'Project',
          entityId: 'proj-uuid-1',
          projectId: 'proj-uuid-1',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.userId).toBe('lead-uuid-1');
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          userId: 'lead-uuid-1',
          title: 'Assigned to Project',
          message: 'You have been assigned to Alpha Team.',
          type: NotificationType.ASSIGNMENT,
          entityType: 'Project',
          entityId: 'proj-uuid-1',
          projectId: 'proj-uuid-1',
        },
      });
    });
  });

  describe('NotificationService Event Helpers', () => {
    it('notifyAssignment should create assignment notification', async () => {
      (prisma.notification.create as any).mockResolvedValue(mockNotification1);

      const result = await NotificationService.notifyAssignment({
        recipientId: 'member-uuid-1',
        entityType: 'Task',
        entityId: 'task-1',
        entityTitle: 'Implement Auth',
        projectId: 'proj-uuid-1',
      });

      expect(result).toEqual(mockNotification1);
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          userId: 'member-uuid-1',
          title: 'New Assignment: Task',
          message: 'You have been assigned to Task "Implement Auth".',
          type: NotificationType.ASSIGNMENT,
          entityType: 'Task',
          entityId: 'task-1',
          projectId: 'proj-uuid-1',
        },
      });
    });

    it('notifyReview should create review notification with feedback', async () => {
      (prisma.notification.create as any).mockResolvedValue(mockNotification2);

      const result = await NotificationService.notifyReview({
        recipientId: 'member-uuid-1',
        entityType: 'Requirement',
        entityId: 'req-1',
        entityTitle: 'User Login',
        status: 'APPROVED',
        feedback: 'Looks good!',
        projectId: 'proj-uuid-1',
      });

      expect(result).toEqual(mockNotification2);
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          userId: 'member-uuid-1',
          title: 'Review Update: Requirement APPROVED',
          message: 'Your Requirement "User Login" has been approved. Feedback: Looks good!',
          type: NotificationType.REVIEW,
          entityType: 'Requirement',
          entityId: 'req-1',
          projectId: 'proj-uuid-1',
        },
      });
    });

    it('notifyStatusChange should create status change notification', async () => {
      (prisma.notification.create as any).mockResolvedValue({
        id: 'notif-5',
        userId: 'member-uuid-1',
        title: 'Status Updated: Task',
        message: 'Status of Task "Implement Auth" was changed to DONE.',
        type: NotificationType.STATUS_CHANGE,
        entityType: 'Task',
        entityId: 'task-1',
        projectId: 'proj-uuid-1',
        read: false,
      });

      await NotificationService.notifyStatusChange({
        recipientId: 'member-uuid-1',
        entityType: 'Task',
        entityId: 'task-1',
        entityTitle: 'Implement Auth',
        newStatus: 'DONE',
        projectId: 'proj-uuid-1',
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          userId: 'member-uuid-1',
          title: 'Status Updated: Task',
          message: 'Status of Task "Implement Auth" was changed to DONE.',
          type: NotificationType.STATUS_CHANGE,
          entityType: 'Task',
          entityId: 'task-1',
          projectId: 'proj-uuid-1',
        },
      });
    });

    it('notifyProjectAction should broadcast notifications to multiple users', async () => {
      (prisma.$transaction as any).mockResolvedValue([mockNotification1, mockNotification2]);

      await NotificationService.notifyProjectAction({
        recipientIds: ['member-uuid-1', 'lead-uuid-1'],
        title: 'Sprint Started',
        message: 'Sprint 1 has started.',
        type: NotificationType.MILESTONE,
        projectId: 'proj-uuid-1',
      });

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('createBulkNotifications should throw error on empty list', async () => {
      await expect(NotificationService.createBulkNotifications([])).rejects.toThrow(
        'Notifications list must be a non-empty array'
      );
    });
  });

  describe('GET /api/notifications - Get User Notifications', () => {
    it('should return 401 if unauthenticated', async () => {
      const response = await request(app).get('/api/notifications');
      expect(response.status).toBe(401);
    });

    it('should return paginated notifications with counts for user', async () => {
      (prisma.notification.count as any)
        .mockResolvedValueOnce(2) // totalCount
        .mockResolvedValueOnce(1); // unreadCount
      (prisma.notification.findMany as any).mockResolvedValue([mockNotification2, mockNotification1]);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .get('/api/notifications?page=1&pageSize=10')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.totalCount).toBe(2);
      expect(response.body.data.unreadCount).toBe(1);
      expect(response.body.data.notifications.length).toBe(2);
      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 'member-uuid-1' },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      });
    });

    it('should filter user notifications by type', async () => {
      (prisma.notification.count as any)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1);
      (prisma.notification.findMany as any).mockResolvedValue([mockNotification1]);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .get('/api/notifications?type=ASSIGNMENT')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'member-uuid-1',
          type: NotificationType.ASSIGNMENT,
        },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
    });
  });

  describe('GET /api/notifications/:id - Get Notification by ID', () => {
    it('should return 401 if unauthenticated', async () => {
      const response = await request(app).get('/api/notifications/notif-1');
      expect(response.status).toBe(401);
    });

    it('should return 404 if notification not found', async () => {
      (prisma.notification.findUnique as any).mockResolvedValue(null);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .get('/api/notifications/nonexistent-notif')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Notification not found');
    });

    it('should return 403 if outsider user attempts to view another user notification', async () => {
      (prisma.notification.findUnique as any).mockResolvedValue(mockNotification1);

      const token = generateToken(outsiderUser);
      const response = await request(app)
        .get('/api/notifications/notif-1')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('insufficient permissions');
    });

    it('should allow notification owner to retrieve notification', async () => {
      (prisma.notification.findUnique as any).mockResolvedValue(mockNotification1);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .get('/api/notifications/notif-1')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('notif-1');
    });

    it('should allow FACULTY to view any notification', async () => {
      (prisma.notification.findUnique as any).mockResolvedValue(mockNotification1);

      const token = generateToken(facultyUser);
      const response = await request(app)
        .get('/api/notifications/notif-1')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe('notif-1');
    });
  });

  describe('DELETE /api/notifications/:id - Delete Notification', () => {
    it('should return 403 if outsider attempts deletion', async () => {
      (prisma.notification.findUnique as any).mockResolvedValue(mockNotification1);

      const token = generateToken(outsiderUser);
      const response = await request(app)
        .delete('/api/notifications/notif-1')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });

    it('should allow owner to delete notification', async () => {
      (prisma.notification.findUnique as any).mockResolvedValue(mockNotification1);
      (prisma.notification.delete as any).mockResolvedValue(mockNotification1);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .delete('/api/notifications/notif-1')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('deleted successfully');
      expect(prisma.notification.delete).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
      });
    });
  });

  describe('GET /api/projects/:projectId/notifications - Project Notifications', () => {
    it('should return 401 if unauthenticated', async () => {
      const response = await request(app).get('/api/projects/proj-uuid-1/notifications');
      expect(response.status).toBe(401);
    });

    it('should return 404 if project not found', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(null);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .get('/api/projects/nonexistent-proj/notifications')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Project not found');
    });

    it('should return 403 if outsider attempts to get project notifications', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProjectWithTeam);

      const token = generateToken(outsiderUser);
      const response = await request(app)
        .get('/api/projects/proj-uuid-1/notifications')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('insufficient permissions');
    });

    it('should retrieve project notifications for team member', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProjectWithTeam);
      (prisma.notification.count as any).mockResolvedValue(2);
      (prisma.notification.findMany as any).mockResolvedValue([
        {
          ...mockNotification1,
          user: { id: 'member-uuid-1', name: 'Member', email: 'member@example.com' },
        },
      ]);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .get('/api/projects/proj-uuid-1/notifications')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.projectId).toBe('proj-uuid-1');
      expect(response.body.data.totalCount).toBe(2);
      expect(response.body.data.notifications.length).toBe(1);
    });
  });
});
