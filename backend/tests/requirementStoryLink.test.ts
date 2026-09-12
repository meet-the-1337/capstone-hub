import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Role, RequirementType, RequirementPriority, RequirementStatus, UserStoryStatus, UserStoryPriority } from '@prisma/client';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { config } from '../src/config';

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    requirement: {
      findUnique: vi.fn(),
    },
    userStory: {
      findUnique: vi.fn(),
    },
    requirementUserStory: {
      upsert: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe('Requirement → User Story Links API', () => {
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

  const mockRequirement = {
    id: 'req-uuid-1',
    title: 'User Authentication',
    description: 'System must authenticate users via JWT',
    type: RequirementType.FUNCTIONAL,
    priority: RequirementPriority.HIGH,
    status: RequirementStatus.APPROVED,
    version: 1,
    projectId: 'proj-uuid-1',
    project: mockProject,
    createdAt: new Date('2026-09-01T10:00:00Z'),
    updatedAt: new Date('2026-09-01T10:00:00Z'),
  };

  const mockUserStory = {
    id: 'story-uuid-1',
    title: 'As a user I can login with email/password',
    description: 'Login form validation and token storage',
    status: UserStoryStatus.TODO,
    priority: UserStoryPriority.HIGH,
    storyPoints: 5,
    order: 1,
    projectId: 'proj-uuid-1',
    project: mockProject,
    sprintId: null,
    createdAt: new Date('2026-09-02T10:00:00Z'),
    updatedAt: new Date('2026-09-02T10:00:00Z'),
  };

  const mockLink = {
    id: 'link-uuid-1',
    requirementId: 'req-uuid-1',
    userStoryId: 'story-uuid-1',
    createdAt: new Date('2026-09-03T10:00:00Z'),
  };

  describe('POST /api/requirements/:id/stories - Link Requirement to User Story', () => {
    it('should return 401 if unauthenticated', async () => {
      const res = await request(app)
        .post('/api/requirements/req-uuid-1/stories')
        .send({ storyId: 'story-uuid-1' });

      expect(res.status).toBe(401);
    });

    it('should return 403 if outsider attempts linking', async () => {
      const token = generateToken(outsiderUser);
      vi.mocked(prisma.requirement.findUnique).mockResolvedValueOnce(mockRequirement as any);

      const res = await request(app)
        .post('/api/requirements/req-uuid-1/stories')
        .set('Authorization', `Bearer ${token}`)
        .send({ storyId: 'story-uuid-1' });

      expect(res.status).toBe(403);
    });

    it('should return 404 if requirement not found', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.requirement.findUnique).mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/requirements/nonexistent-req/stories')
        .set('Authorization', `Bearer ${token}`)
        .send({ storyId: 'story-uuid-1' });

      expect(res.status).toBe(404);
    });

    it('should return 404 if user story not found', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.requirement.findUnique).mockResolvedValueOnce(mockRequirement as any);
      vi.mocked(prisma.userStory.findUnique).mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/requirements/req-uuid-1/stories')
        .set('Authorization', `Bearer ${token}`)
        .send({ storyId: 'nonexistent-story' });

      expect(res.status).toBe(404);
    });

    it('should return 400 if requirement and story belong to different projects', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.requirement.findUnique).mockResolvedValueOnce(mockRequirement as any);
      vi.mocked(prisma.userStory.findUnique).mockResolvedValueOnce({
        ...mockUserStory,
        projectId: 'different-project-id',
      } as any);

      const res = await request(app)
        .post('/api/requirements/req-uuid-1/stories')
        .set('Authorization', `Bearer ${token}`)
        .send({ storyId: 'story-uuid-1' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('different projects');
    });

    it('should link requirement to story successfully', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.requirement.findUnique).mockResolvedValueOnce(mockRequirement as any);
      vi.mocked(prisma.userStory.findUnique).mockResolvedValueOnce(mockUserStory as any);
      vi.mocked(prisma.requirementUserStory.upsert).mockResolvedValueOnce(mockLink as any);

      const res = await request(app)
        .post('/api/requirements/req-uuid-1/stories')
        .set('Authorization', `Bearer ${token}`)
        .send({ storyId: 'story-uuid-1' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.requirement.title).toBe('User Authentication');
      expect(res.body.data.userStory.title).toBe('As a user I can login with email/password');
    });
  });

  describe('DELETE /api/requirements/:requirementId/stories/:storyId - Unlink Requirement from Story', () => {
    it('should return 404 if link does not exist', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.requirement.findUnique).mockResolvedValueOnce(mockRequirement as any);
      vi.mocked(prisma.requirementUserStory.findUnique).mockResolvedValueOnce(null);

      const res = await request(app)
        .delete('/api/requirements/req-uuid-1/stories/story-uuid-1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Link between Requirement and User Story not found');
    });

    it('should unlink successfully for authorized user', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.requirement.findUnique).mockResolvedValueOnce(mockRequirement as any);
      vi.mocked(prisma.requirementUserStory.findUnique).mockResolvedValueOnce(mockLink as any);
      vi.mocked(prisma.requirementUserStory.delete).mockResolvedValueOnce(mockLink as any);

      const res = await request(app)
        .delete('/api/requirements/req-uuid-1/stories/story-uuid-1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('unlinked');
    });
  });

  describe('GET /api/requirements/:id/stories - Get Linked Stories for Requirement', () => {
    it('should return linked stories list', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.requirement.findUnique).mockResolvedValueOnce(mockRequirement as any);
      vi.mocked(prisma.requirementUserStory.findMany).mockResolvedValueOnce([
        {
          id: 'link-uuid-1',
          requirementId: 'req-uuid-1',
          userStoryId: 'story-uuid-1',
          createdAt: new Date('2026-09-03T10:00:00Z'),
          userStory: mockUserStory,
        },
      ] as any);

      const res = await request(app)
        .get('/api/requirements/req-uuid-1/stories')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].userStory.title).toBe('As a user I can login with email/password');
    });
  });

  describe('GET /api/stories/:id/requirements - Get Linked Requirements for User Story', () => {
    it('should return linked requirements list', async () => {
      const token = generateToken(facultyUser);
      vi.mocked(prisma.userStory.findUnique).mockResolvedValueOnce(mockUserStory as any);
      vi.mocked(prisma.requirementUserStory.findMany).mockResolvedValueOnce([
        {
          id: 'link-uuid-1',
          requirementId: 'req-uuid-1',
          userStoryId: 'story-uuid-1',
          createdAt: new Date('2026-09-03T10:00:00Z'),
          requirement: mockRequirement,
        },
      ] as any);

      const res = await request(app)
        .get('/api/stories/story-uuid-1/requirements')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].requirement.title).toBe('User Authentication');
    });
  });
});
