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
    gitHubConnection: {
      upsert: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
    githubConnection: {
      upsert: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

describe('GitHub Connection API', () => {
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
    role: Role.STUDENT,
  };

  const mockProject = {
    id: 'project-uuid-1',
    name: 'CapstoneHub Platform',
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
    githubConnection: null,
  };

  const mockConnectedRepo = {
    id: 'gh-conn-uuid-1',
    projectId: 'project-uuid-1',
    repoOwner: 'meet-the-1337',
    repoName: 'capstone-hub',
    repoUrl: 'https://github.com/meet-the-1337/capstone-hub',
    accessToken: 'ghp_secrettoken12345',
    defaultBranch: 'main',
    createdAt: new Date('2026-09-01T10:00:00Z'),
    updatedAt: new Date('2026-09-01T10:00:00Z'),
  };

  describe('POST /api/projects/:projectId/github/connect', () => {
    it('should return 401 when unauthenticated', async () => {
      const res = await request(app)
        .post('/api/projects/project-uuid-1/github/connect')
        .send({ repoOwner: 'meet-the-1337', repoName: 'capstone-hub' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it('should return 400 when repoOwner or repoName is missing', async () => {
      const token = generateToken(teamLeadUser);

      const res = await request(app)
        .post('/api/projects/project-uuid-1/github/connect')
        .set('Authorization', `Bearer ${token}`)
        .send({ repoOwner: '' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 404 when project does not exist', async () => {
      const token = generateToken(teamLeadUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/projects/nonexistent/github/connect')
        .set('Authorization', `Bearer ${token}`)
        .send({ repoOwner: 'meet-the-1337', repoName: 'capstone-hub' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should return 403 when user is a regular team member without lead role', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(mockProject as any);

      const res = await request(app)
        .post('/api/projects/project-uuid-1/github/connect')
        .set('Authorization', `Bearer ${token}`)
        .send({ repoOwner: 'meet-the-1337', repoName: 'capstone-hub' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should connect GitHub repository when called by TEAM_LEAD', async () => {
      const token = generateToken(teamLeadUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(mockProject as any);
      vi.mocked((prisma as any).gitHubConnection.upsert).mockResolvedValueOnce(mockConnectedRepo as any);

      const res = await request(app)
        .post('/api/projects/project-uuid-1/github/connect')
        .set('Authorization', `Bearer ${token}`)
        .send({
          repoOwner: 'meet-the-1337',
          repoName: 'capstone-hub',
          accessToken: 'ghp_secrettoken12345',
          defaultBranch: 'main',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.repoOwner).toBe('meet-the-1337');
      expect(res.body.data.repoName).toBe('capstone-hub');
      expect(res.body.data.hasAccessToken).toBe(true);
      expect(res.body.data.accessToken).toBeUndefined();
    });

    it('should connect GitHub repository when called by FACULTY', async () => {
      const token = generateToken(facultyUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(mockProject as any);
      vi.mocked((prisma as any).gitHubConnection.upsert).mockResolvedValueOnce(mockConnectedRepo as any);

      const res = await request(app)
        .post('/api/github/connect')
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId: 'project-uuid-1',
          repoOwner: 'meet-the-1337',
          repoName: 'capstone-hub',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/projects/:projectId/github/connection', () => {
    it('should return 401 when unauthenticated', async () => {
      const res = await request(app).get('/api/projects/project-uuid-1/github/connection');

      expect(res.status).toBe(401);
    });

    it('should return 403 when user is an outsider', async () => {
      const token = generateToken(outsiderUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(mockProject as any);

      const res = await request(app)
        .get('/api/projects/project-uuid-1/github/connection')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('should return 404 when project has no connected GitHub repository', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce({
        ...mockProject,
        githubConnection: null,
      } as any);

      const res = await request(app)
        .get('/api/projects/project-uuid-1/github/connection')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('should return connection info for team members', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce({
        ...mockProject,
        githubConnection: mockConnectedRepo,
      } as any);

      const res = await request(app)
        .get('/api/projects/project-uuid-1/github/connection')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.repoOwner).toBe('meet-the-1337');
      expect(res.body.data.repoName).toBe('capstone-hub');
      expect(res.body.data.hasAccessToken).toBe(true);
      expect(res.body.data.accessToken).toBeUndefined();
    });
  });

  describe('DELETE /api/projects/:projectId/github/disconnect', () => {
    it('should return 403 when called by a regular team member', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce({
        ...mockProject,
        githubConnection: mockConnectedRepo,
      } as any);

      const res = await request(app)
        .delete('/api/projects/project-uuid-1/github/disconnect')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('should disconnect GitHub repo when called by TEAM_LEAD', async () => {
      const token = generateToken(teamLeadUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce({
        ...mockProject,
        githubConnection: mockConnectedRepo,
      } as any);
      vi.mocked((prisma as any).gitHubConnection.delete).mockResolvedValueOnce(mockConnectedRepo as any);

      const res = await request(app)
        .delete('/api/projects/project-uuid-1/github/disconnect')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('disconnected');
    });
  });
});
