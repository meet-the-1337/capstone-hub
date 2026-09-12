import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Role, BugPriority, BugSeverity, BugStatus, RequirementStatus, RequirementPriority, RequirementType, UserStoryStatus, UserStoryPriority, TaskStatus, SprintStatus } from '@prisma/client';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { config } from '../src/config';

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    project: {
      findUnique: vi.fn(),
    },
    requirement: {
      findUnique: vi.fn(),
    },
    userStory: {
      findUnique: vi.fn(),
    },
    task: {
      findUnique: vi.fn(),
    },
    sprint: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    bug: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

describe('Bug Traceability API', () => {
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
  };

  const mockRequirement = {
    id: 'req-uuid-1',
    title: 'User Authentication System',
    description: 'OAuth2 with JWT',
    type: RequirementType.FUNCTIONAL,
    priority: RequirementPriority.HIGH,
    status: RequirementStatus.APPROVED,
    projectId: 'proj-uuid-1',
  };

  const mockUserStory = {
    id: 'story-uuid-1',
    title: 'Login page UI and Auth Hook',
    description: 'React form with zod validation',
    status: UserStoryStatus.IN_PROGRESS,
    priority: UserStoryPriority.HIGH,
    projectId: 'proj-uuid-1',
  };

  const mockTask = {
    id: 'task-uuid-1',
    title: 'Verify password hash with bcrypt',
    status: TaskStatus.DONE,
    userStoryId: 'story-uuid-1',
    userStory: {
      id: 'story-uuid-1',
      projectId: 'proj-uuid-1',
    },
  };

  const mockSprint = {
    id: 'sprint-uuid-1',
    name: 'Sprint 1',
    status: SprintStatus.ACTIVE,
    projectId: 'proj-uuid-1',
  };

  const mockBug = {
    id: 'bug-uuid-1',
    title: 'Login token expires too quickly',
    description: 'JWT expires in 5s instead of 1h',
    priority: BugPriority.HIGH,
    severity: BugSeverity.HIGH,
    status: BugStatus.OPEN,
    projectId: 'proj-uuid-1',
    project: mockProject,
    requirementId: 'req-uuid-1',
    requirement: mockRequirement,
    userStoryId: 'story-uuid-1',
    userStory: mockUserStory,
    taskId: 'task-uuid-1',
    task: mockTask,
    sprintId: 'sprint-uuid-1',
    sprint: mockSprint,
    pullRequestUrl: 'https://github.com/meet-the-1337/capstone-hub/pull/26',
    prNumber: 26,
    reporterId: 'member-uuid-1',
    reporter: { id: 'member-uuid-1', name: 'Member One', email: 'member@example.com', role: Role.TEAM_MEMBER },
    assigneeId: 'member-uuid-1',
    assignee: { id: 'member-uuid-1', name: 'Member One', email: 'member@example.com', role: Role.TEAM_MEMBER },
    createdAt: new Date('2026-09-03T10:00:00Z'),
    updatedAt: new Date('2026-09-03T10:00:00Z'),
  };

  describe('POST /api/projects/:projectId/bugs - Create Bug with Trace Links', () => {
    it('should return 401 if unauthenticated', async () => {
      const res = await request(app)
        .post('/api/projects/proj-uuid-1/bugs')
        .send({ title: 'Bug in auth' });

      expect(res.status).toBe(401);
    });

    it('should return 403 if outsider attempts creating bug', async () => {
      const token = generateToken(outsiderUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(mockProject as any);

      const res = await request(app)
        .post('/api/projects/proj-uuid-1/bugs')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Bug in auth' });

      expect(res.status).toBe(403);
    });

    it('should return 400 if title is missing', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(mockProject as any);

      const res = await request(app)
        .post('/api/projects/proj-uuid-1/bugs')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('title is required');
    });

    it('should return 400 if linked requirement belongs to a different project', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(mockProject as any);
      vi.mocked(prisma.requirement.findUnique).mockResolvedValueOnce({
        ...mockRequirement,
        projectId: 'different-project-id',
      } as any);

      const res = await request(app)
        .post('/api/projects/proj-uuid-1/bugs')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Bug in auth',
          requirementId: 'req-uuid-1',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Requirement does not belong to this project');
    });

    it('should successfully create bug linked to requirement, story, task, sprint, and PR', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(mockProject as any);
      vi.mocked(prisma.requirement.findUnique).mockResolvedValueOnce(mockRequirement as any);
      vi.mocked(prisma.userStory.findUnique).mockResolvedValueOnce(mockUserStory as any);
      vi.mocked(prisma.task.findUnique).mockResolvedValueOnce(mockTask as any);
      vi.mocked(prisma.sprint.findUnique).mockResolvedValueOnce(mockSprint as any);
      vi.mocked(prisma.bug.create).mockResolvedValueOnce(mockBug as any);

      const res = await request(app)
        .post('/api/projects/proj-uuid-1/bugs')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Login token expires too quickly',
          description: 'JWT expires in 5s instead of 1h',
          priority: BugPriority.HIGH,
          severity: BugSeverity.HIGH,
          requirementId: 'req-uuid-1',
          userStoryId: 'story-uuid-1',
          taskId: 'task-uuid-1',
          sprintId: 'sprint-uuid-1',
          pullRequestUrl: 'https://github.com/meet-the-1337/capstone-hub/pull/26',
          prNumber: 26,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('bug-uuid-1');
      expect(res.body.data.requirementId).toBe('req-uuid-1');
      expect(res.body.data.prNumber).toBe(26);
    });
  });

  describe('GET /api/projects/:projectId/bugs - Get Project Bugs', () => {
    it('should return list of bugs for the project', async () => {
      const token = generateToken(facultyUser);
      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(mockProject as any);
      vi.mocked(prisma.bug.findMany).mockResolvedValueOnce([mockBug] as any);

      const res = await request(app)
        .get('/api/projects/proj-uuid-1/bugs')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('GET /api/bugs/:id - Get Bug by ID', () => {
    it('should return bug details', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.bug.findUnique).mockResolvedValueOnce(mockBug as any);

      const res = await request(app)
        .get('/api/bugs/bug-uuid-1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Login token expires too quickly');
    });

    it('should return 404 if bug does not exist', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.bug.findUnique).mockResolvedValueOnce(null);

      const res = await request(app)
        .get('/api/bugs/nonexistent')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/bugs/:id - Update Bug', () => {
    it('should update bug status and priority', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.bug.findUnique).mockResolvedValueOnce(mockBug as any);
      vi.mocked(prisma.bug.update).mockResolvedValueOnce({
        ...mockBug,
        status: BugStatus.RESOLVED,
      } as any);

      const res = await request(app)
        .put('/api/bugs/bug-uuid-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: BugStatus.RESOLVED });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(BugStatus.RESOLVED);
    });
  });

  describe('GET /api/bugs/:id/trace - Get Bug Traceability Chain', () => {
    it('should return full traceability graph for a bug', async () => {
      const token = generateToken(facultyUser);
      vi.mocked(prisma.bug.findUnique).mockResolvedValueOnce({
        ...mockBug,
        requirement: {
          ...mockRequirement,
          userStories: [{ userStory: mockUserStory }],
        },
        userStory: {
          ...mockUserStory,
          requirements: [{ requirement: mockRequirement }],
          tasks: [mockTask],
          sprint: mockSprint,
        },
        task: {
          ...mockTask,
          userStory: mockUserStory,
          sprint: mockSprint,
        },
        sprint: mockSprint,
      } as any);

      const res = await request(app)
        .get('/api/bugs/bug-uuid-1/trace')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.bug.id).toBe('bug-uuid-1');
      expect(res.body.data.requirement.id).toBe('req-uuid-1');
      expect(res.body.data.userStory.id).toBe('story-uuid-1');
      expect(res.body.data.task.id).toBe('task-uuid-1');
      expect(res.body.data.sprint.id).toBe('sprint-uuid-1');
    });
  });

  describe('DELETE /api/bugs/:id - Delete Bug', () => {
    it('should delete bug successfully', async () => {
      const token = generateToken(teamMemberUser);
      vi.mocked(prisma.bug.findUnique).mockResolvedValueOnce(mockBug as any);
      vi.mocked(prisma.bug.delete).mockResolvedValueOnce(mockBug as any);

      const res = await request(app)
        .delete('/api/bugs/bug-uuid-1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('deleted successfully');
    });
  });
});
