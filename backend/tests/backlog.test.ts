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
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

describe('Product Backlog API', () => {
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

  const mockBacklogStories = [
    {
      id: 'story-1',
      title: 'First Backlog Story',
      description: 'First story description',
      status: UserStoryStatus.TODO,
      order: 0,
      projectId: 'proj-uuid-1',
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    },
    {
      id: 'story-2',
      title: 'Second Backlog Story',
      description: 'Second story description',
      status: UserStoryStatus.IN_PROGRESS,
      order: 1,
      projectId: 'proj-uuid-1',
      createdAt: new Date('2026-09-02T00:00:00.000Z'),
      updatedAt: new Date('2026-09-02T00:00:00.000Z'),
    },
    {
      id: 'story-3',
      title: 'Third Backlog Story',
      description: 'Third story description',
      status: UserStoryStatus.TODO,
      order: 2,
      projectId: 'proj-uuid-1',
      createdAt: new Date('2026-09-03T00:00:00.000Z'),
      updatedAt: new Date('2026-09-03T00:00:00.000Z'),
    },
  ];

  describe('GET /api/projects/:projectId/backlog - Retrieve Product Backlog', () => {
    it('should return 401 if unauthenticated', async () => {
      const response = await request(app).get('/api/projects/proj-uuid-1/backlog');
      expect(response.status).toBe(401);
    });

    it('should return 404 if project is not found', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(null);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .get('/api/projects/nonexistent-proj/backlog')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Project not found');
    });

    it('should return 403 if requester does not belong to project and is not faculty', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProjectWithTeam);

      const token = generateToken(outsiderUser);
      const response = await request(app)
        .get('/api/projects/proj-uuid-1/backlog')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('insufficient permissions');
    });

    it('should retrieve backlog with ordered stories and project summary for team member', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProjectWithTeam);
      (prisma.userStory.findMany as any).mockResolvedValue(mockBacklogStories);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .get('/api/projects/proj-uuid-1/backlog')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.projectId).toBe('proj-uuid-1');
      expect(response.body.data.projectName).toBe('Capstone Platform Project');
      expect(response.body.data.totalStories).toBe(3);
      expect(response.body.data.stories).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'story-1', order: 0 }),
          expect.objectContaining({ id: 'story-2', order: 1 }),
          expect.objectContaining({ id: 'story-3', order: 2 }),
        ])
      );
      expect(prisma.userStory.findMany).toHaveBeenCalledWith({
        where: { projectId: 'proj-uuid-1' },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      });
    });

    it('should filter backlog stories by status query parameter', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProjectWithTeam);
      (prisma.userStory.findMany as any).mockResolvedValue([mockBacklogStories[1]]);

      const token = generateToken(teamLeadUser);
      const response = await request(app)
        .get('/api/projects/proj-uuid-1/backlog?status=IN_PROGRESS')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.totalStories).toBe(1);
      expect(prisma.userStory.findMany).toHaveBeenCalledWith({
        where: {
          projectId: 'proj-uuid-1',
          status: UserStoryStatus.IN_PROGRESS,
        },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      });
    });

    it('should return 400 for invalid status filter', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProjectWithTeam);

      const token = generateToken(teamLeadUser);
      const response = await request(app)
        .get('/api/projects/proj-uuid-1/backlog?status=UNKNOWN')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid user story status');
    });

    it('should retrieve backlog via /api/backlog/:projectId', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProjectWithTeam);
      (prisma.userStory.findMany as any).mockResolvedValue(mockBacklogStories);

      const token = generateToken(facultyUser);
      const response = await request(app)
        .get('/api/backlog/proj-uuid-1')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.totalStories).toBe(3);
    });

    it('should retrieve backlog via /api/projects/:projectId/product-backlog', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProjectWithTeam);
      (prisma.userStory.findMany as any).mockResolvedValue(mockBacklogStories);

      const token = generateToken(facultyUser);
      const response = await request(app)
        .get('/api/projects/proj-uuid-1/product-backlog')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.totalStories).toBe(3);
    });
  });

  describe('POST /api/projects/:projectId/backlog - Add Story to Product Backlog', () => {
    it('should return 401 if unauthenticated', async () => {
      const response = await request(app)
        .post('/api/projects/proj-uuid-1/backlog')
        .send({ title: 'New Story' });

      expect(response.status).toBe(401);
    });

    it('should return 403 if outsider user tries to add story', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProjectWithTeam);

      const token = generateToken(outsiderUser);
      const response = await request(app)
        .post('/api/projects/proj-uuid-1/backlog')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'New Story', description: 'Story desc' });

      expect(response.status).toBe(403);
    });

    it('should automatically calculate next order index when not provided', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProjectWithTeam);
      (prisma.userStory.findFirst as any).mockResolvedValue({ order: 2 });
      const newStory = {
        id: 'story-4',
        title: 'Fourth Backlog Story',
        description: 'Story description',
        status: UserStoryStatus.TODO,
        order: 3,
        projectId: 'proj-uuid-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (prisma.userStory.create as any).mockResolvedValue(newStory);

      const token = generateToken(teamLeadUser);
      const response = await request(app)
        .post('/api/projects/proj-uuid-1/backlog')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Fourth Backlog Story',
          description: 'Story description',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.order).toBe(3);
      expect(prisma.userStory.findFirst).toHaveBeenCalledWith({
        where: { projectId: 'proj-uuid-1' },
        orderBy: { order: 'desc' },
        select: { order: true },
      });
      expect(prisma.userStory.create).toHaveBeenCalledWith({
        data: {
          title: 'Fourth Backlog Story',
          description: 'Story description',
          status: UserStoryStatus.TODO,
          priority: UserStoryPriority.MEDIUM,
          storyPoints: null,
          order: 3,
          projectId: 'proj-uuid-1',
          sprintId: null,
        },
      });
    });

    it('should default order to 0 when project has no existing stories', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProjectWithTeam);
      (prisma.userStory.findFirst as any).mockResolvedValue(null);
      const firstStory = {
        id: 'story-1',
        title: 'First Backlog Story',
        description: 'Story description',
        status: UserStoryStatus.TODO,
        order: 0,
        projectId: 'proj-uuid-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (prisma.userStory.create as any).mockResolvedValue(firstStory);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .post('/api/backlog/proj-uuid-1')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'First Backlog Story',
          description: 'Story description',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.order).toBe(0);
      expect(prisma.userStory.create).toHaveBeenCalledWith({
        data: {
          title: 'First Backlog Story',
          description: 'Story description',
          status: UserStoryStatus.TODO,
          priority: UserStoryPriority.MEDIUM,
          storyPoints: null,
          order: 0,
          projectId: 'proj-uuid-1',
          sprintId: null,
        },
      });
    });
  });

  describe('PUT /api/projects/:projectId/backlog/reorder - Reorder Backlog', () => {
    it('should return 401 if unauthenticated', async () => {
      const response = await request(app)
        .put('/api/projects/proj-uuid-1/backlog/reorder')
        .send({ storyIds: ['story-3', 'story-1', 'story-2'] });

      expect(response.status).toBe(401);
    });

    it('should return 403 if outsider attempts reordering', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProjectWithTeam);

      const token = generateToken(outsiderUser);
      const response = await request(app)
        .put('/api/projects/proj-uuid-1/backlog/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send({ storyIds: ['story-3', 'story-1', 'story-2'] });

      expect(response.status).toBe(403);
    });

    it('should return 400 if neither storyIds nor items is provided', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProjectWithTeam);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .put('/api/projects/proj-uuid-1/backlog/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Either storyIds array or items array is required');
    });

    it('should return 400 if storyIds is empty array', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProjectWithTeam);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .put('/api/projects/proj-uuid-1/backlog/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send({ storyIds: [] });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('storyIds must be a non-empty array');
    });

    it('should return 400 if any story ID does not belong to the project', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProjectWithTeam);
      // Only 2 of the 3 stories found in DB for this project
      (prisma.userStory.findMany as any).mockResolvedValue([
        { id: 'story-1' },
        { id: 'story-2' },
      ]);

      const token = generateToken(teamLeadUser);
      const response = await request(app)
        .put('/api/projects/proj-uuid-1/backlog/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send({ storyIds: ['story-1', 'story-2', 'foreign-story-3'] });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('do not belong to this project or do not exist');
    });

    it('should successfully reorder user stories using storyIds array', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProjectWithTeam);
      (prisma.userStory.findMany as any)
        .mockResolvedValueOnce([{ id: 'story-3' }, { id: 'story-1' }, { id: 'story-2' }])
        .mockResolvedValueOnce([
          { ...mockBacklogStories[2], order: 0 },
          { ...mockBacklogStories[0], order: 1 },
          { ...mockBacklogStories[1], order: 2 },
        ]);
      (prisma.userStory.update as any).mockResolvedValue({});

      const token = generateToken(teamLeadUser);
      const response = await request(app)
        .put('/api/projects/proj-uuid-1/backlog/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send({ storyIds: ['story-3', 'story-1', 'story-2'] });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Backlog reordered successfully');
      expect(prisma.userStory.update).toHaveBeenCalledWith({
        where: { id: 'story-3' },
        data: { order: 0 },
      });
      expect(prisma.userStory.update).toHaveBeenCalledWith({
        where: { id: 'story-1' },
        data: { order: 1 },
      });
      expect(prisma.userStory.update).toHaveBeenCalledWith({
        where: { id: 'story-2' },
        data: { order: 2 },
      });
    });

    it('should successfully reorder user stories using items array with PATCH', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProjectWithTeam);
      (prisma.userStory.findMany as any)
        .mockResolvedValueOnce([{ id: 'story-1' }, { id: 'story-2' }])
        .mockResolvedValueOnce([
          { ...mockBacklogStories[1], order: 0 },
          { ...mockBacklogStories[0], order: 5 },
        ]);
      (prisma.userStory.update as any).mockResolvedValue({});

      const token = generateToken(facultyUser);
      const response = await request(app)
        .patch('/api/backlog/proj-uuid-1/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send({
          items: [
            { id: 'story-1', order: 5 },
            { id: 'story-2', order: 0 },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(prisma.userStory.update).toHaveBeenCalledWith({
        where: { id: 'story-1' },
        data: { order: 5 },
      });
      expect(prisma.userStory.update).toHaveBeenCalledWith({
        where: { id: 'story-2' },
        data: { order: 0 },
      });
    });
  });
});
