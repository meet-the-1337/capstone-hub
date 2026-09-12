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

describe('GitHub Metadata API', () => {
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

  const mockGitHubApiResponse = {
    id: 123456789,
    name: 'capstone-hub',
    full_name: 'meet-the-1337/capstone-hub',
    private: false,
    html_url: 'https://github.com/meet-the-1337/capstone-hub',
    description: 'Comprehensive Capstone Management Platform',
    fork: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-09-12T12:00:00Z',
    pushed_at: '2026-09-12T12:30:00Z',
    size: 4500,
    stargazers_count: 42,
    watchers_count: 42,
    language: 'TypeScript',
    forks_count: 8,
    open_issues_count: 3,
    default_branch: 'main',
    visibility: 'public',
    topics: ['capstone', 'react', 'nodejs', 'typescript'],
    license: {
      key: 'mit',
      name: 'MIT License',
      spdx_id: 'MIT',
    },
    archived: false,
    disabled: false,
  };

  describe('GET /api/projects/:projectId/github/metadata', () => {
    it('should return 401 when unauthenticated', async () => {
      const res = await request(app).get('/api/projects/project-uuid-1/github/metadata');

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it('should return 403 when user is an outsider', async () => {
      const token = generateToken(outsiderUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(mockProjectWithRepo as any);

      const res = await request(app)
        .get('/api/projects/project-uuid-1/github/metadata')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('should return 404 when project does not exist', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(null);

      const res = await request(app)
        .get('/api/projects/nonexistent/github/metadata')
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
        .get('/api/projects/project-uuid-1/github/metadata')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('No GitHub repository');
    });

    it('should fetch and return GitHub repository metadata successfully for team member', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(mockProjectWithRepo as any);

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => mockGitHubApiResponse,
      });

      const res = await request(app)
        .get('/api/projects/project-uuid-1/github/metadata')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.fullName).toBe('meet-the-1337/capstone-hub');
      expect(res.body.data.stars).toBe(42);
      expect(res.body.data.forks).toBe(8);
      expect(res.body.data.openIssues).toBe(3);
      expect(res.body.data.language).toBe('TypeScript');
      expect(res.body.data.defaultBranch).toBe('main');
      expect(res.body.data.topics).toContain('typescript');
      expect(res.body.data.license).toBe('MIT License');
      expect(res.body.data.visibility).toBe('public');
    });

    it('should fetch and return metadata via alternative endpoint /api/github/:projectId/metadata for faculty', async () => {
      const token = generateToken(facultyUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(mockProjectWithRepo as any);

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => mockGitHubApiResponse,
      });

      const res = await request(app)
        .get('/api/github/project-uuid-1/metadata')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.stars).toBe(42);
    });

    it('should handle GitHub API 404 error when repo is not found on GitHub', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(mockProjectWithRepo as any);

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers(),
      });

      const res = await request(app)
        .get('/api/projects/project-uuid-1/github/metadata')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
    });
  });
});
