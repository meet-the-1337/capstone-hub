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
    },
  },
}));

describe('Faculty Project Progress API', () => {
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

  const mockProjectProgressData = {
    id: 'proj-1',
    name: 'Capstone Platform Project',
    facultyId: 'faculty-uuid-1',
    milestones: [
      { id: 'm-1', title: 'Milestone 1', status: 'COMPLETED' },
      { id: 'm-2', title: 'Milestone 2', status: 'IN_PROGRESS' },
      { id: 'm-3', title: 'Milestone 3', status: 'UPCOMING' },
    ],
    requirements: [
      { id: 'r-1', title: 'Login Feature', status: 'APPROVED', priority: 'HIGH', type: 'FUNCTIONAL', version: 1, createdAt: new Date() },
      { id: 'r-2', title: 'Payment Integration', status: 'IN_REVIEW', priority: 'CRITICAL', type: 'FUNCTIONAL', version: 1, createdAt: new Date() },
      { id: 'r-3', title: 'Performance SLAs', status: 'DRAFT', priority: 'MEDIUM', type: 'NON_FUNCTIONAL', version: 1, createdAt: new Date() },
    ],
    userStories: [
      {
        id: 'us-1',
        title: 'Story 1',
        status: 'COMPLETED',
        storyPoints: 5,
        tasks: [
          { id: 't-1', title: 'Task 1', status: 'DONE' },
          { id: 't-2', title: 'Task 2', status: 'DONE' },
        ],
      },
      {
        id: 'us-2',
        title: 'Story 2',
        status: 'IN_PROGRESS',
        storyPoints: 8,
        tasks: [
          { id: 't-3', title: 'Task 3', status: 'IN_PROGRESS' },
          { id: 't-4', title: 'Task 4', status: 'TODO' },
        ],
      },
    ],
    sprints: [
      {
        id: 'sp-1',
        name: 'Sprint 1',
        status: 'ACTIVE',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-09-14'),
      },
    ],
  };

  describe('GET /api/faculty/projects/:projectId/progress - Project Progress Metrics', () => {
    it('should return 401 if unauthenticated', async () => {
      const response = await request(app).get('/api/faculty/projects/proj-1/progress');
      expect(response.status).toBe(401);
    });

    it('should return 403 if non-faculty attempts access', async () => {
      const token = generateToken(studentUser);
      const response = await request(app)
        .get('/api/faculty/projects/proj-1/progress')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });

    it('should return 404 if project not found', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(null);

      const token = generateToken(facultyUser);
      const response = await request(app)
        .get('/api/faculty/projects/nonexistent/progress')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Project not found');
    });

    it('should calculate accurate progress metrics for milestones, tasks, requirements, and sprints', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProjectProgressData);

      const token = generateToken(facultyUser);
      const response = await request(app)
        .get('/api/faculty/projects/proj-1/progress')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      const data = response.body.data;

      // Milestone metrics
      expect(data.milestones.total).toBe(3);
      expect(data.milestones.completed).toBe(1);
      expect(data.milestones.inProgress).toBe(1);
      expect(data.milestones.upcoming).toBe(1);
      expect(data.milestones.completionPercentage).toBe(33);

      // Task metrics
      expect(data.tasks.total).toBe(4);
      expect(data.tasks.done).toBe(2);
      expect(data.tasks.inProgress).toBe(1);
      expect(data.tasks.todo).toBe(1);
      expect(data.tasks.completionPercentage).toBe(50);

      // Requirement & Pending Review metrics
      expect(data.requirements.total).toBe(3);
      expect(data.requirements.pendingReviewCount).toBe(1);
      expect(data.requirements.pendingReviews.length).toBe(1);
      expect(data.requirements.pendingReviews[0].id).toBe('r-2');

      // User Stories & Story Points
      expect(data.userStories.total).toBe(2);
      expect(data.userStories.completed).toBe(1);
      expect(data.userStories.totalStoryPoints).toBe(13);
      expect(data.userStories.completedStoryPoints).toBe(5);

      // Active Sprint
      expect(data.activeSprint).toBeDefined();
      expect(data.activeSprint.name).toBe('Sprint 1');

      // Overall Progress Percentage
      expect(data.overallProgressPercentage).toBeGreaterThan(0);
    });
  });

  describe('GET /api/faculty/progress - Aggregated Overseen Projects Progress', () => {
    it('should return 401 if unauthenticated', async () => {
      const response = await request(app).get('/api/faculty/progress');
      expect(response.status).toBe(401);
    });

    it('should return aggregated progress metrics across all projects for faculty', async () => {
      (prisma.project.findMany as any).mockResolvedValue([mockProjectProgressData]);

      const token = generateToken(facultyUser);
      const response = await request(app)
        .get('/api/faculty/progress')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      const data = response.body.data;

      expect(data.totalProjects).toBe(1);
      expect(data.summary.totalMilestones).toBe(3);
      expect(data.summary.completedMilestones).toBe(1);
      expect(data.summary.totalTasks).toBe(4);
      expect(data.summary.doneTasks).toBe(2);
      expect(data.summary.totalPendingReviews).toBe(1);
      expect(data.projects.length).toBe(1);
    });
  });
});
