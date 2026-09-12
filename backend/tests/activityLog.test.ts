import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { config } from '../src/config';

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    project: {
      findUnique: vi.fn(),
    },
    activityLog: {
      create: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe('Activity Log API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const generateToken = (payload: { id: string; email: string; role: Role }) => {
    return jwt.sign(payload, config.jwtSecret, { expiresIn: '1h' });
  };

  const facultyUser = { id: 'faculty-1', email: 'faculty@test.com', role: Role.FACULTY };
  const teamMemberUser = { id: 'member-1', email: 'member@test.com', role: Role.TEAM_MEMBER };
  const outsiderUser = { id: 'outsider-1', email: 'outsider@test.com', role: Role.TEAM_MEMBER };

  const mockProject = {
    id: 'proj-1',
    name: 'Test Project',
    facultyId: 'faculty-1',
    teamId: 'team-1',
    team: {
      id: 'team-1',
      name: 'Test Team',
      leadId: 'lead-1',
      members: [
        { teamId: 'team-1', userId: 'member-1', role: Role.TEAM_MEMBER },
      ],
    },
  };

  describe('GET /api/projects/:projectId/activity', () => {
    it('should return activity logs for authorized user', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProject);
      (prisma.activityLog.count as any).mockResolvedValue(2);
      (prisma.activityLog.findMany as any).mockResolvedValue([
        {
          id: 'log-1',
          action: 'CREATED',
          entityType: 'Task',
          entityId: 'task-1',
          actorId: 'member-1',
          projectId: 'proj-1',
          createdAt: new Date(),
          actor: { id: 'member-1', name: 'Member', email: 'member@test.com' },
        },
        {
          id: 'log-2',
          action: 'STATUS_CHANGED',
          entityType: 'Task',
          entityId: 'task-1',
          details: 'TODO -> IN_PROGRESS',
          actorId: 'member-1',
          projectId: 'proj-1',
          createdAt: new Date(),
          actor: { id: 'member-1', name: 'Member', email: 'member@test.com' },
        },
      ]);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .get('/api/projects/proj-1/activity')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.logs).toHaveLength(2);
      expect(response.body.data.totalCount).toBe(2);
    });

    it('should return 403 for unauthorized user', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProject);

      const token = generateToken(outsiderUser);
      const response = await request(app)
        .get('/api/projects/proj-1/activity')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });

    it('should return 404 if project not found', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(null);

      const token = generateToken(facultyUser);
      const response = await request(app)
        .get('/api/projects/nonexistent/activity')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
    });

    it('should support pagination', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProject);
      (prisma.activityLog.count as any).mockResolvedValue(50);
      (prisma.activityLog.findMany as any).mockResolvedValue([]);

      const token = generateToken(facultyUser);
      const response = await request(app)
        .get('/api/projects/proj-1/activity?page=2&pageSize=10')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.page).toBe(2);
      expect(response.body.data.pageSize).toBe(10);
    });
  });

  describe('ActivityLogService.log', () => {
    it('should create an activity log entry', async () => {
      const { ActivityLogService } = await import('../src/services/activityLog.service');

      const mockLog = {
        id: 'log-1',
        action: 'CREATED',
        entityType: 'Task',
        entityId: 'task-1',
        actorId: 'member-1',
        projectId: 'proj-1',
        details: null,
        createdAt: new Date(),
      };
      (prisma.activityLog.create as any).mockResolvedValue(mockLog);

      const result = await ActivityLogService.log({
        action: 'CREATED',
        entityType: 'Task',
        entityId: 'task-1',
        actorId: 'member-1',
        projectId: 'proj-1',
      });

      expect(result).toEqual(mockLog);
      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: {
          action: 'CREATED',
          entityType: 'Task',
          entityId: 'task-1',
          actorId: 'member-1',
          projectId: 'proj-1',
          details: null,
        },
      });
    });
  });
});
