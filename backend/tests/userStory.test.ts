import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Role, UserStoryStatus, UserStoryPriority } from '@prisma/client';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { config } from '../src/config';

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    project: {
      findUnique: vi.fn(),
    },
    userStory: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

describe('User Story API', () => {
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
    name: 'Capstone Platform',
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

  const mockUserStory = {
    id: 'story-uuid-1',
    title: 'User Registration Story',
    description: 'As a student, I want to register so that I can join my capstone project team',
    status: UserStoryStatus.TODO,
    priority: UserStoryPriority.MEDIUM,
    storyPoints: 3,
    projectId: 'proj-uuid-1',
    project: mockProjectWithTeam,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockUserStory2 = {
    id: 'story-uuid-2',
    title: 'User Login Story',
    description: 'As a user, I want to authenticate so that I can access my projects',
    status: UserStoryStatus.IN_PROGRESS,
    priority: UserStoryPriority.HIGH,
    storyPoints: 5,
    projectId: 'proj-uuid-1',
    project: mockProjectWithTeam,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('POST /api/projects/:projectId/stories - Create User Story', () => {
    it('should return 401 if unauthenticated', async () => {
      const response = await request(app)
        .post('/api/projects/proj-uuid-1/stories')
        .send({ title: 'New Story', description: 'Story description' });

      expect(response.status).toBe(401);
    });

    it('should return 404 if project is not found', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(null);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .post('/api/projects/nonexistent-proj/stories')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'New Story', description: 'Story description' });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Project not found');
    });

    it('should return 403 if requester does not belong to project', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProjectWithTeam);

      const token = generateToken(outsiderUser);
      const response = await request(app)
        .post('/api/projects/proj-uuid-1/stories')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'New Story', description: 'Story description' });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('insufficient permissions');
    });

    it('should return 400 if title is missing or empty', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProjectWithTeam);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .post('/api/projects/proj-uuid-1/stories')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: '   ', description: 'Valid description' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('title is required');
    });

    it('should return 400 if status is invalid', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProjectWithTeam);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .post('/api/projects/proj-uuid-1/stories')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Valid Story',
          description: 'Valid Desc',
          status: 'INVALID_STATUS',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid user story status');
    });

    it('should create user story successfully with default status by team member', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProjectWithTeam);
      (prisma.userStory.create as any).mockResolvedValue(mockUserStory);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .post('/api/projects/proj-uuid-1/stories')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'User Registration Story',
          description: 'As a student, I want to register so that I can join my capstone project team',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe(mockUserStory.title);
      expect(response.body.data.status).toBe(UserStoryStatus.TODO);
      expect(prisma.userStory.create).toHaveBeenCalledWith({
        data: {
          title: 'User Registration Story',
          description: 'As a student, I want to register so that I can join my capstone project team',
          status: UserStoryStatus.TODO,
          priority: UserStoryPriority.MEDIUM,
          storyPoints: null,
          order: 0,
          projectId: 'proj-uuid-1',
          sprintId: null,
        },
      });
    });

    it('should create user story successfully via /api/stories with projectId in body by FACULTY', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProjectWithTeam);
      (prisma.userStory.create as any).mockResolvedValue(mockUserStory2);

      const token = generateToken(facultyUser);
      const response = await request(app)
        .post('/api/stories')
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId: 'proj-uuid-1',
          title: 'User Login Story',
          description: 'As a user, I want to authenticate so that I can access my projects',
          status: UserStoryStatus.IN_PROGRESS,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe(UserStoryStatus.IN_PROGRESS);
      expect(prisma.userStory.create).toHaveBeenCalledWith({
        data: {
          title: 'User Login Story',
          description: 'As a user, I want to authenticate so that I can access my projects',
          status: UserStoryStatus.IN_PROGRESS,
          priority: UserStoryPriority.MEDIUM,
          storyPoints: null,
          order: 0,
          projectId: 'proj-uuid-1',
          sprintId: null,
        },
      });
    });
  });

  describe('GET /api/projects/:projectId/stories - Get Project User Stories', () => {
    it('should return 401 if unauthenticated', async () => {
      const response = await request(app).get('/api/projects/proj-uuid-1/stories');
      expect(response.status).toBe(401);
    });

    it('should retrieve all user stories for project', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProjectWithTeam);
      (prisma.userStory.findMany as any).mockResolvedValue([mockUserStory, mockUserStory2]);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .get('/api/projects/proj-uuid-1/stories')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(2);
      expect(prisma.userStory.findMany).toHaveBeenCalledWith({
        where: { projectId: 'proj-uuid-1' },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      });
    });

    it('should filter user stories by status query parameter', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProjectWithTeam);
      (prisma.userStory.findMany as any).mockResolvedValue([mockUserStory2]);

      const token = generateToken(teamLeadUser);
      const response = await request(app)
        .get('/api/projects/proj-uuid-1/stories?status=IN_PROGRESS')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(1);
      expect(prisma.userStory.findMany).toHaveBeenCalledWith({
        where: {
          projectId: 'proj-uuid-1',
          status: UserStoryStatus.IN_PROGRESS,
        },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      });
    });
  });

  describe('GET /api/stories/:id - Get User Story By ID', () => {
    it('should return 401 if unauthenticated', async () => {
      const response = await request(app).get('/api/stories/story-uuid-1');
      expect(response.status).toBe(401);
    });

    it('should retrieve user story by ID', async () => {
      (prisma.userStory.findUnique as any).mockResolvedValue(mockUserStory);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .get('/api/stories/story-uuid-1')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('story-uuid-1');
      expect(response.body.data.title).toBe(mockUserStory.title);
    });

    it('should return 404 if user story is not found', async () => {
      (prisma.userStory.findUnique as any).mockResolvedValue(null);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .get('/api/stories/nonexistent-story')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('User story not found');
    });

    it('should return 403 if requester lacks access to the user story project', async () => {
      (prisma.userStory.findUnique as any).mockResolvedValue(mockUserStory);

      const token = generateToken(outsiderUser);
      const response = await request(app)
        .get('/api/stories/story-uuid-1')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('insufficient permissions');
    });
  });

  describe('PATCH /api/stories/:id - Update User Story', () => {
    it('should return 403 if unauthorized user attempts update', async () => {
      (prisma.userStory.findUnique as any).mockResolvedValue(mockUserStory);

      const token = generateToken(outsiderUser);
      const response = await request(app)
        .patch('/api/stories/story-uuid-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Updated Title' });

      expect(response.status).toBe(403);
    });

    it('should return 400 if no fields are provided', async () => {
      (prisma.userStory.findUnique as any).mockResolvedValue(mockUserStory);

      const token = generateToken(teamLeadUser);
      const response = await request(app)
        .patch('/api/stories/story-uuid-1')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('At least one field must be provided');
    });

    it('should return 400 if updated title is empty', async () => {
      (prisma.userStory.findUnique as any).mockResolvedValue(mockUserStory);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .patch('/api/stories/story-uuid-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: '   ' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('cannot be empty');
    });

    it('should update user story fields successfully', async () => {
      (prisma.userStory.findUnique as any).mockResolvedValue(mockUserStory);
      const updatedStory = {
        ...mockUserStory,
        title: 'Updated Story Title',
        status: UserStoryStatus.COMPLETED,
      };
      (prisma.userStory.update as any).mockResolvedValue(updatedStory);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .patch('/api/stories/story-uuid-1')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Updated Story Title',
          status: UserStoryStatus.COMPLETED,
          priority: UserStoryPriority.CRITICAL,
          storyPoints: 8,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe('Updated Story Title');
      expect(response.body.data.status).toBe(UserStoryStatus.COMPLETED);
      expect(prisma.userStory.update).toHaveBeenCalledWith({
        where: { id: 'story-uuid-1' },
        data: {
          title: 'Updated Story Title',
          status: UserStoryStatus.COMPLETED,
          priority: UserStoryPriority.CRITICAL,
          storyPoints: 8,
        },
      });
    });
  });

  describe('DELETE /api/stories/:id - Delete User Story', () => {
    it('should return 403 if unauthorized user attempts deletion', async () => {
      (prisma.userStory.findUnique as any).mockResolvedValue(mockUserStory);

      const token = generateToken(outsiderUser);
      const response = await request(app)
        .delete('/api/stories/story-uuid-1')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });

    it('should delete user story successfully', async () => {
      (prisma.userStory.findUnique as any).mockResolvedValue(mockUserStory);
      (prisma.userStory.delete as any).mockResolvedValue(mockUserStory);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .delete('/api/stories/story-uuid-1')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('deleted successfully');
      expect(prisma.userStory.delete).toHaveBeenCalledWith({
        where: { id: 'story-uuid-1' },
      });
    });
  });
});
