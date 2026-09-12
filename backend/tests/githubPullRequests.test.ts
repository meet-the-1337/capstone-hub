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

describe('GitHub Pull Requests API', () => {
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

  const mockGitHubPullsResponse = [
    {
      id: 987654321,
      number: 15,
      title: 'feat: implement faculty overview endpoints',
      body: 'This PR adds faculty overview metrics and overseen projects',
      state: 'open',
      draft: false,
      html_url: 'https://github.com/meet-the-1337/capstone-hub/pull/15',
      user: {
        login: 'student-dev',
        avatar_url: 'https://avatars.githubusercontent.com/u/12345',
        html_url: 'https://github.com/student-dev',
      },
      head: {
        label: 'meet-the-1337:feat/faculty-overview',
        ref: 'feat/faculty-overview',
        sha: 'a1b2c3d4e5f67890123456789abcdef012345678',
      },
      base: {
        label: 'nikshrma:main',
        ref: 'main',
        sha: 'b2c3d4e5f67890123456789abcdef0123456789a',
      },
      labels: [
        { id: 1, name: 'enhancement' },
        { id: 2, name: 'backend' },
      ],
      created_at: '2026-09-12T08:00:00Z',
      updated_at: '2026-09-12T10:00:00Z',
      closed_at: null,
      merged_at: null,
    },
    {
      id: 987654320,
      number: 14,
      title: 'feat: add notification read unread state and batch mark endpoints',
      body: 'Batch read unread endpoints for project notifications',
      state: 'closed',
      draft: false,
      html_url: 'https://github.com/meet-the-1337/capstone-hub/pull/14',
      user: {
        login: 'student-dev',
        avatar_url: 'https://avatars.githubusercontent.com/u/12345',
        html_url: 'https://github.com/student-dev',
      },
      head: {
        label: 'meet-the-1337:feat/notification-read-state',
        ref: 'feat/notification-read-state',
        sha: 'c3d4e5f67890123456789abcdef0123456789ab1',
      },
      base: {
        label: 'nikshrma:main',
        ref: 'main',
        sha: 'b2c3d4e5f67890123456789abcdef0123456789a',
      },
      labels: [],
      created_at: '2026-09-11T12:00:00Z',
      updated_at: '2026-09-11T14:00:00Z',
      closed_at: '2026-09-11T14:00:00Z',
      merged_at: '2026-09-11T14:00:00Z',
    },
  ];

  describe('GET /api/projects/:projectId/github/pulls', () => {
    it('should return 401 when unauthenticated', async () => {
      const res = await request(app).get('/api/projects/project-uuid-1/github/pulls');

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it('should return 403 when outsider attempts to retrieve pull requests', async () => {
      const token = generateToken(outsiderUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(mockProjectWithRepo as any);

      const res = await request(app)
        .get('/api/projects/project-uuid-1/github/pulls')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('should return 404 when project not found', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(null);

      const res = await request(app)
        .get('/api/projects/nonexistent/github/pulls')
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
        .get('/api/projects/project-uuid-1/github/pulls')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('No GitHub repository');
    });

    it('should retrieve pull requests list successfully for team members', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(mockProjectWithRepo as any);

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => mockGitHubPullsResponse,
      });

      const res = await request(app)
        .get('/api/projects/project-uuid-1/github/pulls')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.pullRequests).toHaveLength(2);
      expect(res.body.data.pullRequests[0].number).toBe(15);
      expect(res.body.data.pullRequests[0].title).toBe('feat: implement faculty overview endpoints');
      expect(res.body.data.pullRequests[0].state).toBe('open');
      expect(res.body.data.pullRequests[0].isDraft).toBe(false);
      expect(res.body.data.pullRequests[0].user.username).toBe('student-dev');
      expect(res.body.data.pullRequests[0].head.ref).toBe('feat/faculty-overview');
      expect(res.body.data.pullRequests[0].labels).toContain('enhancement');
      expect(res.body.data.pullRequests[1].isMerged).toBe(true);
      expect(res.body.data.totalCount).toBe(2);
    });

    it('should support alternative endpoint /pull-requests and query parameters', async () => {
      const token = generateToken(facultyUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(mockProjectWithRepo as any);

      let fetchedUrl = '';
      globalThis.fetch = vi.fn().mockImplementationOnce(async (url: string) => {
        fetchedUrl = url;
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => [mockGitHubPullsResponse[1]],
        };
      });

      const res = await request(app)
        .get('/api/github/project-uuid-1/pull-requests?state=closed&page=1&per_page=10')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.pullRequests).toHaveLength(1);
      expect(res.body.data.state).toBe('closed');
      expect(fetchedUrl).toContain('state=closed');
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
        .get('/api/projects/project-uuid-1/github/prs')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(502);
      expect(res.body.error).toContain('GitHub API error');
    });
  });
});
