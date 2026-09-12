import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Role, NotificationType } from '@prisma/client';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { config } from '../src/config';

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    project: {
      findUnique: vi.fn(),
    },
    notification: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

describe('Notification Read State API', () => {
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

  const mockUnreadNotification = {
    id: 'notif-unread-1',
    userId: 'member-uuid-1',
    title: 'New Assignment',
    message: 'You have been assigned to task A.',
    type: NotificationType.ASSIGNMENT,
    entityType: 'Task',
    entityId: 'task-1',
    projectId: 'proj-1',
    read: false,
    readAt: null,
    createdAt: new Date('2026-09-12T10:00:00Z'),
    updatedAt: new Date('2026-09-12T10:00:00Z'),
  };

  const mockReadNotification = {
    id: 'notif-read-1',
    userId: 'member-uuid-1',
    title: 'Review Complete',
    message: 'Your requirement was approved.',
    type: NotificationType.REVIEW,
    entityType: 'Requirement',
    entityId: 'req-1',
    projectId: 'proj-1',
    read: true,
    readAt: new Date('2026-09-12T11:00:00Z'),
    createdAt: new Date('2026-09-12T10:30:00Z'),
    updatedAt: new Date('2026-09-12T11:00:00Z'),
  };

  describe('PATCH /api/notifications/:id/read - Mark Single Notification as Read', () => {
    it('should return 401 if unauthenticated', async () => {
      const response = await request(app).patch('/api/notifications/notif-unread-1/read');
      expect(response.status).toBe(401);
    });

    it('should return 404 if notification does not exist', async () => {
      (prisma.notification.findUnique as any).mockResolvedValue(null);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .patch('/api/notifications/nonexistent-notif/read')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Notification not found');
    });

    it('should return 403 if another user tries to mark notification as read', async () => {
      (prisma.notification.findUnique as any).mockResolvedValue(mockUnreadNotification);

      const token = generateToken(outsiderUser);
      const response = await request(app)
        .patch('/api/notifications/notif-unread-1/read')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('insufficient permissions');
    });

    it('should mark notification as read successfully for owner', async () => {
      (prisma.notification.findUnique as any).mockResolvedValue(mockUnreadNotification);
      const updated = { ...mockUnreadNotification, read: true, readAt: new Date() };
      (prisma.notification.update as any).mockResolvedValue(updated);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .patch('/api/notifications/notif-unread-1/read')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('marked as read');
      expect(response.body.data.read).toBe(true);
      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-unread-1' },
        data: {
          read: true,
          readAt: expect.any(Date),
        },
      });
    });

    it('should allow marking as read via PUT /api/notifications/:id/read', async () => {
      (prisma.notification.findUnique as any).mockResolvedValue(mockUnreadNotification);
      const updated = { ...mockUnreadNotification, read: true, readAt: new Date() };
      (prisma.notification.update as any).mockResolvedValue(updated);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .put('/api/notifications/notif-unread-1/read')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.read).toBe(true);
    });

    it('should allow FACULTY to mark any notification as read', async () => {
      (prisma.notification.findUnique as any).mockResolvedValue(mockUnreadNotification);
      const updated = { ...mockUnreadNotification, read: true, readAt: new Date() };
      (prisma.notification.update as any).mockResolvedValue(updated);

      const token = generateToken(facultyUser);
      const response = await request(app)
        .patch('/api/notifications/notif-unread-1/read')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('PATCH /api/notifications/:id/unread - Mark Single Notification as Unread', () => {
    it('should return 401 if unauthenticated', async () => {
      const response = await request(app).patch('/api/notifications/notif-read-1/unread');
      expect(response.status).toBe(401);
    });

    it('should return 404 if notification is not found', async () => {
      (prisma.notification.findUnique as any).mockResolvedValue(null);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .patch('/api/notifications/nonexistent/unread')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
    });

    it('should return 403 if outsider tries to mark notification as unread', async () => {
      (prisma.notification.findUnique as any).mockResolvedValue(mockReadNotification);

      const token = generateToken(outsiderUser);
      const response = await request(app)
        .patch('/api/notifications/notif-read-1/unread')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });

    it('should mark notification as unread successfully for owner', async () => {
      (prisma.notification.findUnique as any).mockResolvedValue(mockReadNotification);
      const updated = { ...mockReadNotification, read: false, readAt: null };
      (prisma.notification.update as any).mockResolvedValue(updated);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .patch('/api/notifications/notif-read-1/unread')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('marked as unread');
      expect(response.body.data.read).toBe(false);
      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-read-1' },
        data: {
          read: false,
          readAt: null,
        },
      });
    });
  });

  describe('POST /api/notifications/mark-all-read - Mark All Notifications as Read', () => {
    it('should return 401 if unauthenticated', async () => {
      const response = await request(app).post('/api/notifications/mark-all-read');
      expect(response.status).toBe(401);
    });

    it('should mark all unread notifications as read for current user', async () => {
      (prisma.notification.updateMany as any).mockResolvedValue({ count: 5 });

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .post('/api/notifications/mark-all-read')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('All notifications marked as read');
      expect(response.body.data.count).toBe(5);
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'member-uuid-1',
          read: false,
        },
        data: {
          read: true,
          readAt: expect.any(Date),
        },
      });
    });

    it('should also work via POST /api/notifications/read-all', async () => {
      (prisma.notification.updateMany as any).mockResolvedValue({ count: 3 });

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .post('/api/notifications/read-all')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.count).toBe(3);
    });
  });

  describe('GET /api/notifications/unread-count - Unread Notifications Count', () => {
    it('should return 401 if unauthenticated', async () => {
      const response = await request(app).get('/api/notifications/unread-count');
      expect(response.status).toBe(401);
    });

    it('should return unread count for current user', async () => {
      (prisma.notification.count as any).mockResolvedValue(4);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .get('/api/notifications/unread-count')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.unreadCount).toBe(4);
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: {
          userId: 'member-uuid-1',
          read: false,
        },
      });
    });

    it('should return unread count via /api/notifications/unread/count', async () => {
      (prisma.notification.count as any).mockResolvedValue(2);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .get('/api/notifications/unread/count')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.unreadCount).toBe(2);
    });
  });

  describe('GET /api/notifications?read=true/false - Filtering by Read State', () => {
    it('should filter notifications by read=true', async () => {
      (prisma.notification.count as any)
        .mockResolvedValueOnce(1) // totalCount for where
        .mockResolvedValueOnce(0); // unreadCount
      (prisma.notification.findMany as any).mockResolvedValue([mockReadNotification]);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .get('/api/notifications?read=true')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'member-uuid-1',
          read: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
    });

    it('should filter notifications by read=false', async () => {
      (prisma.notification.count as any)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1);
      (prisma.notification.findMany as any).mockResolvedValue([mockUnreadNotification]);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .get('/api/notifications?read=false')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'member-uuid-1',
          read: false,
        },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
    });
  });
});
