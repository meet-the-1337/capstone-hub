import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

describe('GitHub Contributors & Activity API', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
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

  const mockProjectWithRepo = {
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
    githubConnection: {
      id: 'gh-conn-uuid-1',
      projectId: 'project-uuid-1',
      repoOwner: 'meet-the-1337',
      repoName: 'capstone-hub',
      repoUrl: 'https://github.com/meet-the-1337/capstone-hub',
      accessToken: 'ghp_secrettoken12345',
      defaultBranch: 'main',
      createdAt: new Date('2026-09-01T10:00:00Z'),
      updatedAt: new Date('2026-09-01T10:00:00Z'),
    },
  };

  const mockGitHubContributorsResponse = [
    {
      id: 101,
      login: 'alice-dev',
      avatar_url: 'https://avatars.githubusercontent.com/u/101',
      html_url: 'https://github.com/alice-dev',
      contributions: 42,
      type: 'User',
      site_admin: false,
    },
    {
      id: 102,
      login: 'bob-engineer',
      avatar_url: 'https://avatars.githubusercontent.com/u/102',
      html_url: 'https://github.com/bob-engineer',
      contributions: 28,
      type: 'User',
      site_admin: false,
    },
  ];

  describe('GET /api/projects/:projectId/github/contributors', () => {
    it('should return 401 when unauthenticated', async () => {
      const res = await request(app).get('/api/projects/project-uuid-1/github/contributors');

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it('should return 403 when outsider attempts to retrieve contributors', async () => {
      const token = generateToken(outsiderUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(mockProjectWithRepo as any);

      const res = await request(app)
        .get('/api/projects/project-uuid-1/github/contributors')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('should return 404 when project not found', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(null);

      const res = await request(app)
        .get('/api/projects/nonexistent/github/contributors')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('should return 404 when project has no connected repository', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce({
        ...mockProjectWithRepo,
        githubConnection: null,
      } as any);

      const res = await request(app)
        .get('/api/projects/project-uuid-1/github/contributors')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('No GitHub repository');
    });

    it('should retrieve contributors list successfully for team members', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(mockProjectWithRepo as any);

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => mockGitHubContributorsResponse,
      });

      const res = await request(app)
        .get('/api/projects/project-uuid-1/github/contributors')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.contributors).toHaveLength(2);
      expect(res.body.data.contributors[0].username).toBe('alice-dev');
      expect(res.body.data.contributors[0].contributions).toBe(42);
      expect(res.body.data.contributors[1].username).toBe('bob-engineer');
      expect(res.body.data.contributors[1].contributions).toBe(28);
      expect(res.body.data.totalContributions).toBe(70);
      expect(res.body.data.totalContributors).toBe(2);
    });

    it('should retrieve activity via /api/github/:projectId/activity for faculty', async () => {
      const token = generateToken(facultyUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(mockProjectWithRepo as any);

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => mockGitHubContributorsResponse,
      });

      const res = await request(app)
        .get('/api/github/project-uuid-1/activity')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalContributions).toBe(70);
    });

    it('should handle errors from GitHub API gracefully', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(mockProjectWithRepo as any);

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers(),
      });

      const res = await request(app)
        .get('/api/projects/project-uuid-1/github/contributors')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(502);
      expect(res.body.error).toContain('GitHub API error');
    });
  });
});
