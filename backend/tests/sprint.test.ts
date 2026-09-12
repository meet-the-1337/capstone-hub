import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Role, SprintStatus } from '@prisma/client';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { config } from '../src/config';

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    project: { findUnique: vi.fn() },
    sprint: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    userStory: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    task: {
      findMany: vi.fn(),
    }
  },
}));

describe('Sprint API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const generateToken = (payload: { id: string; email: string; role: Role }) => {
    return jwt.sign(payload, config.jwtSecret, { expiresIn: '1h' });
  };

  const teamMemberUser = { id: 'member-1', email: 'member@test.com', role: Role.TEAM_MEMBER };
  const outsiderUser = { id: 'outsider-1', email: 'out@test.com', role: Role.TEAM_MEMBER };

  const mockProject = {
    id: 'proj-1',
    name: 'Test Project',
    facultyId: null,
    teamId: 'team-1',
    team: {
      id: 'team-1',
      leadId: 'lead-1',
      members: [{ userId: 'member-1', role: Role.TEAM_MEMBER }],
    },
  };

  const mockSprint = {
    id: 'sprint-1',
    name: 'Sprint 1',
    startDate: new Date('2026-09-01'),
    endDate: new Date('2026-09-14'),
    status: SprintStatus.PLANNED,
    projectId: 'proj-1',
    project: mockProject,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('POST /api/projects/:projectId/sprints', () => {
    it('should create sprint successfully', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProject);
      (prisma.sprint.create as any).mockResolvedValue(mockSprint);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .post('/api/projects/proj-1/sprints')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Sprint 1',
          startDate: '2026-09-01',
          endDate: '2026-09-14',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(prisma.sprint.create).toHaveBeenCalled();
    });

    it('should return 400 if start date is after end date', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProject);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .post('/api/projects/proj-1/sprints')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Sprint 1',
          startDate: '2026-09-14',
          endDate: '2026-09-01',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('before end date');
    });

    it('should return 403 if unauthorized', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProject);
      const token = generateToken(outsiderUser);
      const response = await request(app)
        .post('/api/projects/proj-1/sprints')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Sprint 1', startDate: '2026-09-01', endDate: '2026-09-14' });

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/projects/:projectId/sprints', () => {
    it('should get sprints', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProject);
      (prisma.sprint.findMany as any).mockResolvedValue([mockSprint]);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .get('/api/projects/proj-1/sprints')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(1);
    });
  });

  describe('PATCH /api/sprints/:id', () => {
    it('should update sprint successfully', async () => {
      (prisma.sprint.findUnique as any).mockResolvedValue(mockSprint);
      (prisma.sprint.update as any).mockResolvedValue({ ...mockSprint, name: 'Updated Sprint' });

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .patch('/api/sprints/sprint-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Sprint' });

      expect(response.status).toBe(200);
      expect(prisma.sprint.update).toHaveBeenCalled();
    });
  });

  describe('DELETE /api/sprints/:id', () => {
    it('should delete sprint successfully', async () => {
      (prisma.sprint.findUnique as any).mockResolvedValue(mockSprint);
      (prisma.sprint.delete as any).mockResolvedValue(mockSprint);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .delete('/api/sprints/sprint-1')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(prisma.sprint.delete).toHaveBeenCalled();
    });
  });

  describe('POST /api/sprints/:id/stories', () => {
    it('should assign stories successfully', async () => {
      (prisma.sprint.findUnique as any).mockResolvedValue(mockSprint);
      (prisma.userStory.findMany as any).mockResolvedValue([
        { id: 'story-1', projectId: 'proj-1' },
        { id: 'story-2', projectId: 'proj-1' }
      ]);
      (prisma.userStory.updateMany as any).mockResolvedValue({ count: 2 });

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .post('/api/sprints/sprint-1/stories')
        .set('Authorization', `Bearer ${token}`)
        .send({ storyIds: ['story-1', 'story-2'] });

      expect(response.status).toBe(200);
      expect(prisma.userStory.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['story-1', 'story-2'] } },
        data: { sprintId: 'sprint-1' }
      });
    });

    it('should fail if stories belong to a different project', async () => {
      (prisma.sprint.findUnique as any).mockResolvedValue(mockSprint);
      (prisma.userStory.findMany as any).mockResolvedValue([
        { id: 'story-1', projectId: 'proj-1' },
        { id: 'story-3', projectId: 'diff-proj' }
      ]);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .post('/api/sprints/sprint-1/stories')
        .set('Authorization', `Bearer ${token}`)
        .send({ storyIds: ['story-1', 'story-3'] });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('belong to the same project');
    });
  });

  describe('GET /api/sprints/:id/board', () => {
    it('should get sprint board successfully', async () => {
      (prisma.sprint.findUnique as any).mockResolvedValue(mockSprint);
      (prisma.task.findMany as any).mockResolvedValue([
        { id: 'task-1', status: 'TODO', userStoryId: 'story-1' },
        { id: 'task-2', status: 'IN_PROGRESS', userStoryId: 'story-1' },
      ]);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .get('/api/sprints/sprint-1/board')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.TODO).toHaveLength(1);
      expect(response.body.data.IN_PROGRESS).toHaveLength(1);
      expect(response.body.data.DONE).toHaveLength(0);
    });

    it('should return 403 if unauthorized', async () => {
      (prisma.sprint.findUnique as any).mockResolvedValue(mockSprint);
      const token = generateToken(outsiderUser);
      
      const response = await request(app)
        .get('/api/sprints/sprint-1/board')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });
  });
});
