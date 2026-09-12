import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Role, TaskStatus, UserStoryStatus, UserStoryPriority } from '@prisma/client';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { config } from '../src/config';

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    task: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    userStory: {
      findUnique: vi.fn(),
    },
  },
}));

describe('User Story → Task Links API', () => {
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

  const mockStoryA = {
    id: 'story-uuid-1',
    title: 'Authentication Story',
    description: 'Implement login',
    status: UserStoryStatus.TODO,
    priority: UserStoryPriority.HIGH,
    storyPoints: 5,
    order: 1,
    projectId: 'proj-uuid-1',
    project: mockProject,
    sprintId: null,
    createdAt: new Date('2026-09-01T10:00:00Z'),
    updatedAt: new Date('2026-09-01T10:00:00Z'),
  };

  const mockStoryB = {
    id: 'story-uuid-2',
    title: 'Registration Story',
    description: 'Implement signup',
    status: UserStoryStatus.TODO,
    priority: UserStoryPriority.MEDIUM,
    storyPoints: 3,
    order: 2,
    projectId: 'proj-uuid-1',
    project: mockProject,
    sprintId: null,
    createdAt: new Date('2026-09-01T10:00:00Z'),
    updatedAt: new Date('2026-09-01T10:00:00Z'),
  };

  const mockTask = {
    id: 'task-uuid-1',
    title: 'Implement JWT signing service',
    description: 'Create sign and verify helpers',
    status: TaskStatus.TODO,
    userStoryId: 'story-uuid-1',
    userStory: mockStoryA,
    assigneeId: 'member-uuid-1',
    createdAt: new Date('2026-09-02T10:00:00Z'),
    updatedAt: new Date('2026-09-02T10:00:00Z'),
  };

  describe('POST /api/stories/:storyId/tasks/:taskId - Link Task to Story', () => {
    it('should return 401 if unauthenticated', async () => {
      const res = await request(app).post('/api/stories/story-uuid-2/tasks/task-uuid-1');

      expect(res.status).toBe(401);
    });

    it('should return 403 if outsider attempts linking', async () => {
      const token = generateToken(outsiderUser);
      vi.mocked(prisma.task.findUnique).mockResolvedValueOnce(mockTask as any);

      const res = await request(app)
        .post('/api/stories/story-uuid-2/tasks/task-uuid-1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('should return 404 if task does not exist', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.task.findUnique).mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/stories/story-uuid-2/tasks/nonexistent-task')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('should return 404 if target story does not exist', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.task.findUnique).mockResolvedValueOnce(mockTask as any);
      vi.mocked(prisma.userStory.findUnique).mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/stories/nonexistent-story/tasks/task-uuid-1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('should return 400 if task and target story belong to different projects', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.task.findUnique).mockResolvedValueOnce(mockTask as any);
      vi.mocked(prisma.userStory.findUnique).mockResolvedValueOnce({
        ...mockStoryB,
        projectId: 'different-project-uuid',
      } as any);

      const res = await request(app)
        .post('/api/stories/story-uuid-2/tasks/task-uuid-1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('different project');
    });

    it('should successfully link/move task to another user story within the same project', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.task.findUnique).mockResolvedValueOnce(mockTask as any);
      vi.mocked(prisma.userStory.findUnique).mockResolvedValueOnce(mockStoryB as any);
      vi.mocked(prisma.task.update).mockResolvedValueOnce({
        ...mockTask,
        userStoryId: 'story-uuid-2',
        userStory: mockStoryB,
      } as any);

      const res = await request(app)
        .post('/api/stories/story-uuid-2/tasks/task-uuid-1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.userStoryId).toBe('story-uuid-2');
    });
  });

  describe('GET /api/tasks/:id/story - Get Parent User Story', () => {
    it('should return the linked parent user story', async () => {
      const token = generateToken(facultyUser);
      vi.mocked(prisma.task.findUnique).mockResolvedValueOnce(mockTask as any);

      const res = await request(app)
        .get('/api/tasks/task-uuid-1/story')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('story-uuid-1');
      expect(res.body.data.title).toBe('Authentication Story');
    });
  });
});
