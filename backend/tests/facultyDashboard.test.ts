import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { config } from '../src/config';

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    project: {
      findMany: vi.fn(),
    },
    activityLog: {
      findMany: vi.fn(),
    },
    notification: {
      count: vi.fn(),
    },
  },
}));

describe('Faculty Dashboard API', () => {
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

  const mockFacultyProfile = {
    id: 'faculty-uuid-1',
    name: 'Dr. Alan Turing',
    email: 'advisor@example.com',
    role: Role.FACULTY,
  };

  const mockDashboardProjects = [
    {
      id: 'proj-1',
      name: 'Autonomous Drone Navigation',
      description: 'Vision-based obstacle avoidance',
      facultyId: 'faculty-uuid-1',
      createdAt: new Date('2026-09-01T00:00:00Z'),
      updatedAt: new Date('2026-09-01T00:00:00Z'),
      team: {
        id: 'team-1',
        name: 'Aero Team',
        lead: { id: 'lead-1', name: 'Alice', email: 'alice@example.com' },
        members: [
          {
            userId: 'lead-1',
            role: Role.TEAM_LEAD,
            user: { id: 'lead-1', name: 'Alice', email: 'alice@example.com', role: Role.TEAM_LEAD },
          },
        ],
      },
      milestones: [
        { id: 'm-1', title: 'Hardware Setup', status: 'COMPLETED', dueDate: new Date('2026-09-10') },
        { id: 'm-2', title: 'Algorithm Testing', status: 'IN_PROGRESS', dueDate: new Date('2026-09-25') },
      ],
      requirements: [
        { id: 'r-1', title: 'Camera Stream', status: 'APPROVED', priority: 'HIGH', type: 'FUNCTIONAL', version: 1, createdAt: new Date() },
        { id: 'r-2', title: 'SLAM Integration', status: 'IN_REVIEW', priority: 'CRITICAL', type: 'FUNCTIONAL', version: 1, createdAt: new Date() },
      ],
      userStories: [
        {
          id: 'us-1',
          title: 'Stereo Vision',
          status: 'COMPLETED',
          storyPoints: 5,
          tasks: [{ id: 't-1', title: 'Calibrate Cameras', status: 'DONE' }],
        },
        {
          id: 'us-2',
          title: 'Obstacle Detection',
          status: 'IN_PROGRESS',
          storyPoints: 8,
          tasks: [{ id: 't-2', title: 'Depth Map Processing', status: 'IN_PROGRESS' }],
        },
      ],
      sprints: [
        {
          id: 'sp-1',
          name: 'Sprint Alpha',
          status: 'ACTIVE',
          startDate: new Date('2026-09-01'),
          endDate: new Date('2026-09-15'),
        },
      ],
    },
  ];

  const mockActivityLogs = [
    {
      id: 'log-1',
      action: 'REQUIREMENT_SUBMITTED',
      entityType: 'Requirement',
      entityId: 'r-2',
      details: 'Requirement submitted for review',
      actorId: 'lead-1',
      actor: { id: 'lead-1', name: 'Alice', email: 'alice@example.com' },
      projectId: 'proj-1',
      createdAt: new Date(),
    },
  ];

  describe('GET /api/faculty/dashboard - Faculty Monitoring Dashboard', () => {
    it('should return 401 if unauthenticated', async () => {
      const response = await request(app).get('/api/faculty/dashboard');
      expect(response.status).toBe(401);
    });

    it('should return 403 if non-faculty attempts to access dashboard', async () => {
      const token = generateToken(studentUser);
      const response = await request(app)
        .get('/api/faculty/dashboard')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('faculty role required');
    });

    it('should return 404 if faculty record not found in database', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);

      const token = generateToken(facultyUser);
      const response = await request(app)
        .get('/api/faculty/dashboard')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Faculty user not found');
    });

    it('should return comprehensive aggregated dashboard for faculty member', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(mockFacultyProfile);
      (prisma.project.findMany as any).mockResolvedValue(mockDashboardProjects);
      (prisma.activityLog.findMany as any).mockResolvedValue(mockActivityLogs);
      (prisma.notification.count as any).mockResolvedValue(3);

      const token = generateToken(facultyUser);
      const response = await request(app)
        .get('/api/faculty/dashboard')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      const data = response.body.data;

      // Faculty profile
      expect(data.faculty.id).toBe('faculty-uuid-1');
      expect(data.faculty.name).toBe('Dr. Alan Turing');

      // Metric Summary Cards
      expect(data.summary.totalProjects).toBe(1);
      expect(data.summary.totalMilestones).toBe(2);
      expect(data.summary.completedMilestones).toBe(1);
      expect(data.summary.totalTasks).toBe(2);
      expect(data.summary.doneTasks).toBe(1);
      expect(data.summary.pendingReviewsCount).toBe(1);
      expect(data.summary.unreadNotificationsCount).toBe(3);
      expect(data.summary.overallAverageProgress).toBeGreaterThan(0);

      // Projects
      expect(data.projects.length).toBe(1);
      expect(data.projects[0].projectName).toBe('Autonomous Drone Navigation');
      expect(data.projects[0].team.name).toBe('Aero Team');

      // Pending Reviews
      expect(data.pendingReviews.length).toBe(1);
      expect(data.pendingReviews[0].requirementId).toBe('r-2');
      expect(data.pendingReviews[0].title).toBe('SLAM Integration');

      // Upcoming Deadlines
      expect(data.upcomingDeadlines.length).toBe(1);
      expect(data.upcomingDeadlines[0].milestoneId).toBe('m-2');

      // Recent Activity
      expect(data.recentActivity.length).toBe(1);
      expect(data.recentActivity[0].action).toBe('REQUIREMENT_SUBMITTED');
    });

    it('should return dashboard for specific faculty ID via /api/faculty/:facultyId/dashboard', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(mockFacultyProfile);
      (prisma.project.findMany as any).mockResolvedValue(mockDashboardProjects);
      (prisma.activityLog.findMany as any).mockResolvedValue(mockActivityLogs);
      (prisma.notification.count as any).mockResolvedValue(0);

      const token = generateToken(facultyUser);
      const response = await request(app)
        .get('/api/faculty/faculty-uuid-1/dashboard')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.summary.totalProjects).toBe(1);
    });
  });
});
