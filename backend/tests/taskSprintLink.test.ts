import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Role, TaskStatus, SprintStatus } from '@prisma/client';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { config } from '../src/config';

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    sprint: {
      findUnique: vi.fn(),
    },
    task: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    userStory: {
      findUnique: vi.fn(),
    },
  },
}));

describe('Task → Sprint Links API', () => {
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
    role: Role.STUDENT,
  };

  const mockProject = {
    id: 'proj-uuid-1',
    name: 'Capstone Platform',
    facultyId: 'faculty-uuid-1',
    teamId: 'team-uuid-1',
    team: {
      id: 'team-uuid-1',
      leadId: 'lead-uuid-1',
      members: [
        { userId: 'lead-uuid-1', role: Role.TEAM_LEAD },
        { userId: 'member-uuid-1', role: Role.TEAM_MEMBER },
      ],
    },
  };

  const mockSprint = {
    id: 'sprint-uuid-1',
    name: 'Sprint 1',
    goal: 'Build authentication',
    status: SprintStatus.PLANNED,
    startDate: new Date('2026-09-01'),
    endDate: new Date('2026-09-15'),
    projectId: 'proj-uuid-1',
    project: mockProject,
    createdAt: new Date('2026-09-01'),
    updatedAt: new Date('2026-09-01'),
  };

  const mockTask1 = {
    id: 'task-uuid-1',
    title: 'Implement JWT signing service',
    description: 'Create sign and verify helpers',
    status: TaskStatus.TODO,
    userStoryId: 'story-uuid-1',
    userStory: {
      id: 'story-uuid-1',
      title: 'Authentication Story',
      projectId: 'proj-uuid-1',
      project: mockProject,
    },
    sprintId: null,
    assigneeId: 'member-uuid-1',
    createdAt: new Date('2026-09-02'),
    updatedAt: new Date('2026-09-02'),
  };

  const mockTask2 = {
    id: 'task-uuid-2',
    title: 'Build registration UI',
    description: 'HTML form and validations',
    status: TaskStatus.TODO,
    userStoryId: 'story-uuid-2',
    userStory: {
      id: 'story-uuid-2',
      title: 'Registration Story',
      projectId: 'proj-uuid-1',
      project: mockProject,
    },
    sprintId: null,
    assigneeId: 'member-uuid-1',
    createdAt: new Date('2026-09-02'),
    updatedAt: new Date('2026-09-02'),
  };

  describe('POST /api/sprints/:id/tasks - Assign Tasks to Sprint', () => {
    it('should return 401 if unauthenticated', async () => {
      const res = await request(app)
        .post('/api/sprints/sprint-uuid-1/tasks')
        .send({ taskIds: ['task-uuid-1'] });

      expect(res.status).toBe(401);
    });

    it('should return 403 if unauthorized user attempts assigning tasks', async () => {
      const token = generateToken(outsiderUser);
      vi.mocked(prisma.sprint.findUnique).mockResolvedValueOnce(mockSprint as any);

      const res = await request(app)
        .post('/api/sprints/sprint-uuid-1/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ taskIds: ['task-uuid-1'] });

      expect(res.status).toBe(403);
    });

    it('should return 404 if sprint not found', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.sprint.findUnique).mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/sprints/nonexistent/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ taskIds: ['task-uuid-1'] });

      expect(res.status).toBe(404);
    });

    it('should return 404 if one or more tasks do not exist', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.sprint.findUnique).mockResolvedValueOnce(mockSprint as any);
      vi.mocked(prisma.task.findMany).mockResolvedValueOnce([mockTask1] as any);

      const res = await request(app)
        .post('/api/sprints/sprint-uuid-1/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ taskIds: ['task-uuid-1', 'nonexistent-task'] });

      expect(res.status).toBe(404);
    });

    it('should return 400 if task belongs to a different project', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.sprint.findUnique).mockResolvedValueOnce(mockSprint as any);
      vi.mocked(prisma.task.findMany).mockResolvedValueOnce([
        {
          ...mockTask1,
          userStory: { ...mockTask1.userStory, projectId: 'other-project-id' },
        },
      ] as any);

      const res = await request(app)
        .post('/api/sprints/sprint-uuid-1/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ taskIds: ['task-uuid-1'] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('same project');
    });

    it('should assign tasks to sprint successfully', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.sprint.findUnique).mockResolvedValueOnce(mockSprint as any);
      vi.mocked(prisma.task.findMany).mockResolvedValueOnce([mockTask1, mockTask2] as any);
      vi.mocked(prisma.task.updateMany).mockResolvedValueOnce({ count: 2 } as any);

      const res = await request(app)
        .post('/api/sprints/sprint-uuid-1/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ taskIds: ['task-uuid-1', 'task-uuid-2'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(prisma.task.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['task-uuid-1', 'task-uuid-2'] } },
        data: { sprintId: 'sprint-uuid-1' },
      });
    });
  });

  describe('DELETE /api/sprints/:sprintId/tasks/:taskId - Remove Task from Sprint', () => {
    it('should remove task from sprint successfully', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.sprint.findUnique).mockResolvedValueOnce(mockSprint as any);
      vi.mocked(prisma.task.findUnique).mockResolvedValueOnce({
        ...mockTask1,
        sprintId: 'sprint-uuid-1',
      } as any);
      vi.mocked(prisma.task.update).mockResolvedValueOnce({
        ...mockTask1,
        sprintId: null,
      } as any);

      const res = await request(app)
        .delete('/api/sprints/sprint-uuid-1/tasks/task-uuid-1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-uuid-1' },
        data: { sprintId: null },
      });
    });
  });

  describe('GET /api/sprints/:id/tasks - Get Sprint Tasks', () => {
    it('should return list of tasks assigned to sprint', async () => {
      const token = generateToken(facultyUser);
      vi.mocked(prisma.sprint.findUnique).mockResolvedValueOnce(mockSprint as any);
      vi.mocked(prisma.task.findMany).mockResolvedValueOnce([
        { ...mockTask1, sprintId: 'sprint-uuid-1' },
      ] as any);

      const res = await request(app)
        .get('/api/sprints/sprint-uuid-1/tasks')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('POST /api/tasks/:id/sprint - Direct Task to Sprint Link', () => {
    it('should link task directly to a sprint in the same project', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.task.findUnique).mockResolvedValueOnce(mockTask1 as any);
      vi.mocked(prisma.sprint.findUnique).mockResolvedValueOnce(mockSprint as any);
      vi.mocked(prisma.task.update).mockResolvedValueOnce({
        ...mockTask1,
        sprintId: 'sprint-uuid-1',
        sprint: mockSprint,
      } as any);

      const res = await request(app)
        .post('/api/tasks/task-uuid-1/sprint')
        .set('Authorization', `Bearer ${token}`)
        .send({ sprintId: 'sprint-uuid-1' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.sprintId).toBe('sprint-uuid-1');
    });
  });
});
