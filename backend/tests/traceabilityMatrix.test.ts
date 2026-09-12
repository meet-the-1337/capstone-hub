import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Role, RequirementType, RequirementPriority, RequirementStatus, UserStoryStatus, UserStoryPriority, TaskStatus, SprintStatus, BugPriority, BugSeverity, BugStatus } from '@prisma/client';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { config } from '../src/config';

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    project: {
      findUnique: vi.fn(),
    },
    requirement: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    userStory: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    task: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    sprint: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    bug: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

describe('Complete Project Traceability API', () => {
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
    description: 'Central project hub',
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
      id: 'gh-conn-1',
      projectId: 'proj-uuid-1',
      repoOwner: 'nikshrma',
      repoName: 'capstone-hub',
    },
  };

  const mockSprint = {
    id: 'sprint-uuid-1',
    name: 'Sprint 1',
    status: SprintStatus.ACTIVE,
    startDate: new Date('2026-09-01'),
    endDate: new Date('2026-09-15'),
    projectId: 'proj-uuid-1',
    userStories: [],
    tasks: [],
    bugs: [],
  };

  const mockTask = {
    id: 'task-uuid-1',
    title: 'Implement JWT sign & verify',
    description: 'Auth helper functions',
    status: TaskStatus.DONE,
    userStoryId: 'story-uuid-1',
    sprintId: 'sprint-uuid-1',
    sprint: mockSprint,
    assignee: { id: 'member-uuid-1', name: 'Member One', email: 'member@example.com', role: Role.TEAM_MEMBER },
    bugs: [],
  };

  const mockUserStory = {
    id: 'story-uuid-1',
    title: 'User Authentication Flow',
    description: 'Login and token generation',
    status: UserStoryStatus.IN_PROGRESS,
    priority: UserStoryPriority.HIGH,
    storyPoints: 5,
    projectId: 'proj-uuid-1',
    sprintId: 'sprint-uuid-1',
    sprint: mockSprint,
    tasks: [mockTask],
    bugs: [],
  };

  const mockRequirement = {
    id: 'req-uuid-1',
    title: 'Secure Authentication Requirement',
    description: 'Users must authenticate securely',
    type: RequirementType.FUNCTIONAL,
    priority: RequirementPriority.HIGH,
    status: RequirementStatus.APPROVED,
    version: 1,
    projectId: 'proj-uuid-1',
    userStories: [
      {
        requirementId: 'req-uuid-1',
        userStoryId: 'story-uuid-1',
        userStory: mockUserStory,
      },
    ],
    bugs: [],
  };

  const mockBug = {
    id: 'bug-uuid-1',
    title: 'Token expiry too short',
    status: BugStatus.OPEN,
    priority: BugPriority.HIGH,
    severity: BugSeverity.HIGH,
    projectId: 'proj-uuid-1',
    requirementId: 'req-uuid-1',
    userStoryId: 'story-uuid-1',
    taskId: 'task-uuid-1',
    sprintId: 'sprint-uuid-1',
    pullRequestUrl: 'https://github.com/meet-the-1337/capstone-hub/pull/26',
    prNumber: 26,
    reporter: { id: 'member-uuid-1', name: 'Member One', email: 'member@example.com' },
    assignee: { id: 'member-uuid-1', name: 'Member One', email: 'member@example.com' },
  };

  describe('GET /api/projects/:projectId/traceability - Project Traceability Tree', () => {
    it('should return 401 when unauthenticated', async () => {
      const res = await request(app).get('/api/projects/proj-uuid-1/traceability');

      expect(res.status).toBe(401);
    });

    it('should return 403 when outsider attempts access', async () => {
      const token = generateToken(outsiderUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(mockProject as any);

      const res = await request(app)
        .get('/api/projects/proj-uuid-1/traceability')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('should return 404 when project does not exist', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(null);

      const res = await request(app)
        .get('/api/projects/nonexistent/traceability')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('should return complete hierarchical traceability tree with coverage statistics', async () => {
      const token = generateToken(facultyUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(mockProject as any);
      vi.mocked(prisma.requirement.findMany).mockResolvedValueOnce([mockRequirement] as any);
      vi.mocked(prisma.userStory.findMany).mockResolvedValueOnce([
        { ...mockUserStory, requirements: [{ requirement: mockRequirement }] },
      ] as any);
      vi.mocked(prisma.task.findMany).mockResolvedValueOnce([mockTask] as any);
      vi.mocked(prisma.sprint.findMany).mockResolvedValueOnce([mockSprint] as any);
      vi.mocked(prisma.bug.findMany).mockResolvedValueOnce([mockBug] as any);

      const res = await request(app)
        .get('/api/projects/proj-uuid-1/traceability')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.project.id).toBe('proj-uuid-1');
      expect(res.body.data.tree).toHaveLength(1);
      expect(res.body.data.tree[0].id).toBe('req-uuid-1');
      expect(res.body.data.tree[0].stories).toHaveLength(1);
      expect(res.body.data.tree[0].stories[0].tasks).toHaveLength(1);
      expect(res.body.data.coverage.totalRequirements).toBe(1);
      expect(res.body.data.coverage.coveredRequirements).toBe(1);
      expect(res.body.data.coverage.requirementCoverageRate).toBe(100);
      expect(res.body.data.coverage.totalTasks).toBe(1);
      expect(res.body.data.coverage.completedTasks).toBe(1);
    });
  });

  describe('GET /api/projects/:projectId/traceability/matrix - Traceability Matrix Rows', () => {
    it('should return flattened traceability matrix rows', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(mockProject as any);
      vi.mocked(prisma.requirement.findMany).mockResolvedValueOnce([mockRequirement] as any);
      vi.mocked(prisma.userStory.findMany).mockResolvedValueOnce([mockUserStory] as any);
      vi.mocked(prisma.task.findMany).mockResolvedValueOnce([mockTask] as any);
      vi.mocked(prisma.bug.findMany).mockResolvedValueOnce([mockBug] as any);

      const res = await request(app)
        .get('/api/projects/proj-uuid-1/traceability/matrix')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.projectId).toBe('proj-uuid-1');
      expect(res.body.data.rows).toBeInstanceOf(Array);
      expect(res.body.data.rows[0].requirementId).toBe('req-uuid-1');
      expect(res.body.data.rows[0].userStoryId).toBe('story-uuid-1');
      expect(res.body.data.rows[0].taskId).toBe('task-uuid-1');
      expect(res.body.data.rows[0].bugId).toBe('bug-uuid-1');
      expect(res.body.data.rows[0].prNumber).toBe(26);
    });
  });

  describe('GET /api/traceability/requirements/:requirementId - Requirement Traceability', () => {
    it('should return specific requirement trace graph', async () => {
      const token = generateToken(facultyUser);
      vi.mocked(prisma.requirement.findUnique).mockResolvedValueOnce({
        ...mockRequirement,
        project: mockProject,
      } as any);

      const res = await request(app)
        .get('/api/traceability/requirements/req-uuid-1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('req-uuid-1');
      expect(res.body.data.userStories).toHaveLength(1);
    });
  });

  describe('GET /api/traceability/stories/:storyId - Story Traceability', () => {
    it('should return specific user story trace', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.userStory.findUnique).mockResolvedValueOnce({
        ...mockUserStory,
        project: mockProject,
        requirements: [{ requirement: mockRequirement }],
      } as any);

      const res = await request(app)
        .get('/api/traceability/stories/story-uuid-1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('story-uuid-1');
      expect(res.body.data.requirements).toHaveLength(1);
      expect(res.body.data.tasks).toHaveLength(1);
    });
  });

  describe('GET /api/traceability/tasks/:taskId - Task Traceability', () => {
    it('should return specific task trace', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.task.findUnique).mockResolvedValueOnce({
        ...mockTask,
        userStory: {
          ...mockUserStory,
          project: mockProject,
          requirements: [{ requirement: mockRequirement }],
        },
      } as any);

      const res = await request(app)
        .get('/api/traceability/tasks/task-uuid-1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('task-uuid-1');
      expect(res.body.data.userStory.id).toBe('story-uuid-1');
    });
  });
});
