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

describe('GitHub Branches API', () => {
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

  const mockGitHubBranchesResponse = [
    {
      name: 'main',
      commit: {
        sha: 'a1b2c3d4e5f67890123456789abcdef012345678',
        url: 'https://api.github.com/repos/meet-the-1337/capstone-hub/commits/a1b2c3d4e5f67890123456789abcdef012345678',
      },
      protected: true,
    },
    {
      name: 'develop',
      commit: {
        sha: 'b2c3d4e5f67890123456789abcdef0123456789a',
        url: 'https://api.github.com/repos/meet-the-1337/capstone-hub/commits/b2c3d4e5f67890123456789abcdef0123456789a',
      },
      protected: false,
    },
    {
      name: 'feat/notifications',
      commit: {
        sha: 'c3d4e5f67890123456789abcdef0123456789ab1',
        url: 'https://api.github.com/repos/meet-the-1337/capstone-hub/commits/c3d4e5f67890123456789abcdef0123456789ab1',
      },
      protected: false,
    },
  ];

  describe('GET /api/projects/:projectId/github/branches', () => {
    it('should return 401 when unauthenticated', async () => {
      const res = await request(app).get('/api/projects/project-uuid-1/github/branches');

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it('should return 403 when outsider attempts to retrieve branches', async () => {
      const token = generateToken(outsiderUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(mockProjectWithRepo as any);

      const res = await request(app)
        .get('/api/projects/project-uuid-1/github/branches')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('should return 404 when project not found', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(null);

      const res = await request(app)
        .get('/api/projects/nonexistent/github/branches')
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
        .get('/api/projects/project-uuid-1/github/branches')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('No GitHub repository');
    });

    it('should retrieve branches list successfully with default branch identification', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(mockProjectWithRepo as any);

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => mockGitHubBranchesResponse,
      });

      const res = await request(app)
        .get('/api/projects/project-uuid-1/github/branches')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.branches).toHaveLength(3);
      expect(res.body.data.defaultBranch).toBe('main');
      expect(res.body.data.branches[0].name).toBe('main');
      expect(res.body.data.branches[0].isDefault).toBe(true);
      expect(res.body.data.branches[0].protected).toBe(true);
      expect(res.body.data.branches[0].commit.shortSha).toBe('a1b2c3d');
      expect(res.body.data.branches[1].isDefault).toBe(false);
      expect(res.body.data.totalCount).toBe(3);
    });

    it('should pass query parameters via /api/github/:projectId/branches', async () => {
      const token = generateToken(facultyUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(mockProjectWithRepo as any);

      let fetchedUrl = '';
      globalThis.fetch = vi.fn().mockImplementationOnce(async (url: string) => {
        fetchedUrl = url;
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => [mockGitHubBranchesResponse[0]],
        };
      });

      const res = await request(app)
        .get('/api/github/project-uuid-1/branches?protected=true&page=1&per_page=10')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.branches).toHaveLength(1);
      expect(fetchedUrl).toContain('protected=true');
      expect(fetchedUrl).toContain('page=1');
      expect(fetchedUrl).toContain('per_page=10');
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
        .get('/api/projects/project-uuid-1/github/branches')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(502);
      expect(res.body.error).toContain('GitHub API error');
    });
  });
});
