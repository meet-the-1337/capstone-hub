import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Role, TaskStatus } from '@prisma/client';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { config } from '../src/config';

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    userStory: { findUnique: vi.fn() },
    task: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

describe('Task API', () => {
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
    facultyId: null,
    teamId: 'team-1',
    team: {
      id: 'team-1',
      leadId: 'lead-1',
      members: [{ userId: 'member-1', role: Role.TEAM_MEMBER }],
    },
  };

  const mockUserStory = {
    id: 'story-1',
    title: 'Story 1',
    projectId: 'proj-1',
    project: mockProject,
  };

  const mockTask = {
    id: 'task-1',
    title: 'Task 1',
    description: 'Task Desc',
    status: TaskStatus.TODO,
    userStoryId: 'story-1',
    userStory: mockUserStory,
    assigneeId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('POST /api/stories/:storyId/tasks', () => {
    it('should create task successfully', async () => {
      (prisma.userStory.findUnique as any).mockResolvedValue(mockUserStory);
      (prisma.task.create as any).mockResolvedValue(mockTask);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .post('/api/stories/story-1/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Task 1' });

      expect(response.status).toBe(201);
      expect(prisma.task.create).toHaveBeenCalled();
    });

    it('should return 403 if unauthorized user', async () => {
      (prisma.userStory.findUnique as any).mockResolvedValue(mockUserStory);

      const token = generateToken(outsiderUser);
      const response = await request(app)
        .post('/api/stories/story-1/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Task 1' });

      expect(response.status).toBe(403);
    });

    it('should assign a user if assigneeId provided and user exists', async () => {
      (prisma.userStory.findUnique as any).mockResolvedValue(mockUserStory);
      (prisma.user.findUnique as any).mockResolvedValue({ id: 'member-1' });
      (prisma.task.create as any).mockResolvedValue({ ...mockTask, assigneeId: 'member-1' });

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .post('/api/stories/story-1/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Task 1', assigneeId: 'member-1' });

      expect(response.status).toBe(201);
      expect(prisma.task.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ assigneeId: 'member-1' })
      }));
    });

    it('should fail if assignee is not a team member', async () => {
      (prisma.userStory.findUnique as any).mockResolvedValue(mockUserStory);
      (prisma.user.findUnique as any).mockResolvedValue({ id: 'outsider-1' });

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .post('/api/stories/story-1/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Task 1', assigneeId: 'outsider-1' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('member of the project team');
    });
  });

  describe('GET /api/stories/:storyId/tasks', () => {
    it('should return tasks for a story', async () => {
      (prisma.userStory.findUnique as any).mockResolvedValue(mockUserStory);
      (prisma.task.findMany as any).mockResolvedValue([mockTask]);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .get('/api/stories/story-1/tasks')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(1);
    });
  });

  describe('PATCH /api/tasks/:id', () => {
    it('should update task successfully', async () => {
      (prisma.task.findUnique as any).mockResolvedValue(mockTask); // status is TODO
      (prisma.task.update as any).mockResolvedValue({ ...mockTask, status: TaskStatus.IN_PROGRESS });

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .patch('/api/tasks/task-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: TaskStatus.IN_PROGRESS });

      expect(response.status).toBe(200);
      expect(prisma.task.update).toHaveBeenCalled();
    });

    it('should fail on invalid status transition', async () => {
      (prisma.task.findUnique as any).mockResolvedValue(mockTask); // status is TODO
      
      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .patch('/api/tasks/task-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: TaskStatus.DONE });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid status transition');
    });

    it('should fail to update if assignee is not a team member', async () => {
      (prisma.task.findUnique as any).mockResolvedValue(mockTask);
      (prisma.user.findUnique as any).mockResolvedValue({ id: 'outsider-1' });

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .patch('/api/tasks/task-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ assigneeId: 'outsider-1' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('member of the project team');
    });
  });

  describe('DELETE /api/tasks/:id', () => {
    it('should delete task successfully', async () => {
      (prisma.task.findUnique as any).mockResolvedValue(mockTask);
      (prisma.task.delete as any).mockResolvedValue(mockTask);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .delete('/api/tasks/task-1')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(prisma.task.delete).toHaveBeenCalled();
    });
  });
});
