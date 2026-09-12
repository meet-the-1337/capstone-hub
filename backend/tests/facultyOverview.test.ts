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
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe('Faculty Project Overview API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const generateToken = (payload: { id: string; email: string; role: Role }) => {
    return jwt.sign(payload, config.jwtSecret, { expiresIn: '1h' });
  };

  const facultyUser = {
    id: 'faculty-uuid-1',
    email: 'advisor@example.com',
    role: Role.FACULTY,
  };

  const studentUser = {
    id: 'student-uuid-1',
    email: 'student@example.com',
    role: Role.TEAM_MEMBER,
  };

  const mockProjects = [
    {
      id: 'proj-1',
      name: 'AI Healthcare Platform',
      description: 'Medical diagnostics app',
      facultyId: 'faculty-uuid-1',
      createdAt: new Date('2026-09-01T00:00:00Z'),
      updatedAt: new Date('2026-09-01T00:00:00Z'),
      faculty: {
        id: 'faculty-uuid-1',
        name: 'Dr. Smith',
        email: 'advisor@example.com',
        role: Role.FACULTY,
      },
      team: {
        id: 'team-1',
        name: 'Team MedAI',
        lead: { id: 'lead-1', name: 'Alice', email: 'alice@example.com' },
        members: [
          {
            userId: 'lead-1',
            role: Role.TEAM_LEAD,
            user: { id: 'lead-1', name: 'Alice', email: 'alice@example.com', role: Role.TEAM_LEAD },
          },
          {
            userId: 'student-uuid-1',
            role: Role.TEAM_MEMBER,
            user: { id: 'student-uuid-1', name: 'Bob', email: 'student@example.com', role: Role.TEAM_MEMBER },
          },
        ],
      },
      _count: {
        milestones: 3,
        requirements: 5,
        userStories: 8,
        sprints: 2,
      },
    },
  ];

  describe('GET /api/faculty/projects - List Overseen Projects', () => {
    it('should return 401 if unauthenticated', async () => {
      const response = await request(app).get('/api/faculty/projects');
      expect(response.status).toBe(401);
    });

    it('should return 403 if non-faculty attempts to access', async () => {
      const token = generateToken(studentUser);
      const response = await request(app)
        .get('/api/faculty/projects')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('faculty role required');
    });

    it('should retrieve list of overseen projects with basic information and counts for faculty', async () => {
      (prisma.project.count as any).mockResolvedValue(1);
      (prisma.project.findMany as any).mockResolvedValue(mockProjects);

      const token = generateToken(facultyUser);
      const response = await request(app)
        .get('/api/faculty/projects')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.totalCount).toBe(1);
      expect(response.body.data.projects.length).toBe(1);
      const project = response.body.data.projects[0];
      expect(project.id).toBe('proj-1');
      expect(project.name).toBe('AI Healthcare Platform');
      expect(project.team.name).toBe('Team MedAI');
      expect(project.team.memberCount).toBe(2);
      expect(project.summary.totalMilestones).toBe(3);
      expect(project.summary.totalRequirements).toBe(5);
      expect(project.summary.totalUserStories).toBe(8);
      expect(project.summary.totalSprints).toBe(2);
    });

    it('should retrieve projects for specific faculty ID via /api/faculty/:facultyId/projects', async () => {
      (prisma.project.count as any).mockResolvedValue(1);
      (prisma.project.findMany as any).mockResolvedValue(mockProjects);

      const token = generateToken(facultyUser);
      const response = await request(app)
        .get('/api/faculty/faculty-uuid-1/projects')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.projects.length).toBe(1);
    });
  });

  describe('GET /api/faculty/projects/:projectId - Get Overseen Project Detail', () => {
    it('should return 401 if unauthenticated', async () => {
      const response = await request(app).get('/api/faculty/projects/proj-1');
      expect(response.status).toBe(401);
    });

    it('should return 403 if non-faculty attempts access', async () => {
      const token = generateToken(studentUser);
      const response = await request(app)
        .get('/api/faculty/projects/proj-1')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });

    it('should return 404 if project is not found', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(null);

      const token = generateToken(facultyUser);
      const response = await request(app)
        .get('/api/faculty/projects/nonexistent')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Project not found');
    });

    it('should return detailed overview of single overseen project for faculty', async () => {
      const projectDetail = {
        ...mockProjects[0],
        milestones: [{ id: 'm-1', title: 'Phase 1', status: 'COMPLETED', dueDate: null }],
        requirements: [{ id: 'r-1', title: 'Auth Req', status: 'APPROVED', priority: 'HIGH', type: 'FUNCTIONAL' }],
      };
      (prisma.project.findUnique as any).mockResolvedValue(projectDetail);

      const token = generateToken(facultyUser);
      const response = await request(app)
        .get('/api/faculty/projects/proj-1')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('proj-1');
      expect(response.body.data.milestones.length).toBe(1);
      expect(response.body.data.requirements.length).toBe(1);
      expect(response.body.data.summary.totalUserStories).toBe(8);
    });
  });
});
