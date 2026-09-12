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

describe('GitHub Commits API', () => {
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

  const mockGitHubCommitsResponse = [
    {
      sha: 'a1b2c3d4e5f67890123456789abcdef012345678',
      commit: {
        author: {
          name: 'Developer 1',
          email: 'dev1@example.com',
          date: '2026-09-12T10:00:00Z',
        },
        committer: {
          name: 'Developer 1',
          email: 'dev1@example.com',
          date: '2026-09-12T10:00:00Z',
        },
        message: 'feat: add project notifications workflow',
        tree: {
          sha: 'tree12345',
        },
      },
      html_url: 'https://github.com/meet-the-1337/capstone-hub/commit/a1b2c3d4e5f67890123456789abcdef012345678',
      author: {
        login: 'dev1',
        avatar_url: 'https://avatars.githubusercontent.com/u/12345',
      },
      committer: {
        login: 'dev1',
        avatar_url: 'https://avatars.githubusercontent.com/u/12345',
      },
      parents: [
        {
          sha: 'b2c3d4e5f67890123456789abcdef0123456789a',
        },
      ],
    },
    {
      sha: 'b2c3d4e5f67890123456789abcdef0123456789a',
      commit: {
        author: {
          name: 'Developer 2',
          email: 'dev2@example.com',
          date: '2026-09-11T15:30:00Z',
        },
        committer: {
          name: 'Developer 2',
          email: 'dev2@example.com',
          date: '2026-09-11T15:30:00Z',
        },
        message: 'fix: resolve task status race condition',
        tree: {
          sha: 'tree67890',
        },
      },
      html_url: 'https://github.com/meet-the-1337/capstone-hub/commit/b2c3d4e5f67890123456789abcdef0123456789a',
      author: {
        login: 'dev2',
        avatar_url: 'https://avatars.githubusercontent.com/u/67890',
      },
      committer: {
        login: 'dev2',
        avatar_url: 'https://avatars.githubusercontent.com/u/67890',
      },
      parents: [],
    },
  ];

  describe('GET /api/projects/:projectId/github/commits', () => {
    it('should return 401 when unauthenticated', async () => {
      const res = await request(app).get('/api/projects/project-uuid-1/github/commits');

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it('should return 403 when outsider attempts to retrieve commits', async () => {
      const token = generateToken(outsiderUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(mockProjectWithRepo as any);

      const res = await request(app)
        .get('/api/projects/project-uuid-1/github/commits')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('should return 404 when project not found', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(null);

      const res = await request(app)
        .get('/api/projects/nonexistent/github/commits')
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
        .get('/api/projects/project-uuid-1/github/commits')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('No GitHub repository');
    });

    it('should retrieve commits list successfully for team members', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(mockProjectWithRepo as any);

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => mockGitHubCommitsResponse,
      });

      const res = await request(app)
        .get('/api/projects/project-uuid-1/github/commits')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.commits).toHaveLength(2);
      expect(res.body.data.commits[0].sha).toBe('a1b2c3d4e5f67890123456789abcdef012345678');
      expect(res.body.data.commits[0].shortSha).toBe('a1b2c3d');
      expect(res.body.data.commits[0].message).toBe('feat: add project notifications workflow');
      expect(res.body.data.commits[0].author.name).toBe('Developer 1');
      expect(res.body.data.commits[0].author.username).toBe('dev1');
      expect(res.body.data.commits[0].parents).toContain('b2c3d4e5f67890123456789abcdef0123456789a');
      expect(res.body.data.totalCount).toBe(2);
      expect(res.body.data.branch).toBe('main');
    });

    it('should filter commits with query params via /api/github/:projectId/commits', async () => {
      const token = generateToken(facultyUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(mockProjectWithRepo as any);

      let fetchedUrl = '';
      globalThis.fetch = vi.fn().mockImplementationOnce(async (url: string) => {
        fetchedUrl = url;
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => [mockGitHubCommitsResponse[0]],
        };
      });

      const res = await request(app)
        .get('/api/github/project-uuid-1/commits?branch=develop&author=dev1&page=2&per_page=10')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.commits).toHaveLength(1);
      expect(res.body.data.branch).toBe('develop');
      expect(res.body.data.page).toBe(2);
      expect(res.body.data.perPage).toBe(10);
      expect(fetchedUrl).toContain('sha=develop');
      expect(fetchedUrl).toContain('author=dev1');
      expect(fetchedUrl).toContain('page=2');
      expect(fetchedUrl).toContain('per_page=10');
    });

    it('should handle rate limit error from GitHub API', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(mockProjectWithRepo as any);

      const headers = new Headers();
      headers.set('x-ratelimit-remaining', '0');

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers,
      });

      const res = await request(app)
        .get('/api/projects/project-uuid-1/github/commits')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(429);
      expect(res.body.error).toContain('rate limit exceeded');
    });
  });
});
