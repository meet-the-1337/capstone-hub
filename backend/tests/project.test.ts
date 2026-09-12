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
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    team: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    teamMember: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    task: {
      findMany: vi.fn(),
    },
  },
}));

describe('Project API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const generateToken = (payload: { id: string; email: string; role: Role }) => {
    return jwt.sign(payload, config.jwtSecret, { expiresIn: '1h' });
  };

  const facultyUser = {
    id: 'faculty-uuid-1',
    email: 'prof.smith@example.com',
    role: Role.FACULTY,
  };

  const teamLeadUser = {
    id: 'lead-uuid-1',
    email: 'alice.lead@example.com',
    role: Role.TEAM_LEAD,
  };

  const otherTeamLeadUser = {
    id: 'other-lead-uuid-2',
    email: 'bob.lead@example.com',
    role: Role.TEAM_LEAD,
  };

  const teamMemberUser = {
    id: 'member-uuid-1',
    email: 'charlie.member@example.com',
    role: Role.TEAM_MEMBER,
  };

  const mockProject = {
    id: 'proj-uuid-1',
    name: 'CapstoneHub Platform',
    description: 'Academic project management',
    facultyId: 'faculty-uuid-1',
    teamId: 'team-uuid-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    team: {
      id: 'team-uuid-1',
      name: 'Alpha Team',
      leadId: 'lead-uuid-1',
      members: [
        {
          id: 'tm-1',
          teamId: 'team-uuid-1',
          userId: 'lead-uuid-1',
          role: Role.TEAM_LEAD,
        },
        {
          id: 'tm-2',
          teamId: 'team-uuid-1',
          userId: 'member-uuid-1',
          role: Role.TEAM_MEMBER,
        },
      ],
    },
    faculty: {
      id: 'faculty-uuid-1',
      name: 'Prof Smith',
      email: 'prof.smith@example.com',
    },
  };

  describe('PUT /api/projects/:id & PATCH /api/projects/:id', () => {
    it('should return 401 if unauthenticated', async () => {
      const response = await request(app)
        .put('/api/projects/proj-uuid-1')
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 404 if project is not found', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(null);

      const token = generateToken(facultyUser);
      const response = await request(app)
        .put('/api/projects/nonexistent-id')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'New Project Name' });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Project not found');
    });

    it('should return 403 if user is a TEAM_MEMBER', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProject);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .put('/api/projects/proj-uuid-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Unauthorized Change' });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Access denied: insufficient permissions');
      expect(prisma.project.update).not.toHaveBeenCalled();
    });

    it('should return 403 if user is a TEAM_LEAD of an unrelated team', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProject);

      const token = generateToken(otherTeamLeadUser);
      const response = await request(app)
        .put('/api/projects/proj-uuid-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Unauthorized Change from Other Lead' });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Access denied: insufficient permissions');
      expect(prisma.project.update).not.toHaveBeenCalled();
    });

    it('should return 400 if no update fields are provided', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProject);

      const token = generateToken(facultyUser);
      const response = await request(app)
        .put('/api/projects/proj-uuid-1')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('At least one field must be provided to update');
      expect(prisma.project.update).not.toHaveBeenCalled();
    });

    it('should return 400 if project name is empty or whitespace', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProject);

      const token = generateToken(facultyUser);
      const response = await request(app)
        .put('/api/projects/proj-uuid-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '   ' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Project name cannot be empty');
      expect(prisma.project.update).not.toHaveBeenCalled();
    });

    it('should return 400 if facultyId does not exist', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProject);
      (prisma.user.findUnique as any).mockResolvedValue(null);

      const token = generateToken(facultyUser);
      const response = await request(app)
        .patch('/api/projects/proj-uuid-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ facultyId: 'nonexistent-faculty' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Faculty user not found');
      expect(prisma.project.update).not.toHaveBeenCalled();
    });

    it('should return 400 if assigned faculty user does not have FACULTY role', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProject);
      (prisma.user.findUnique as any).mockResolvedValue({
        id: 'user-not-faculty',
        role: Role.TEAM_MEMBER,
      });

      const token = generateToken(facultyUser);
      const response = await request(app)
        .patch('/api/projects/proj-uuid-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ facultyId: 'user-not-faculty' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Assigned user must have FACULTY role');
      expect(prisma.project.update).not.toHaveBeenCalled();
    });

    it('should return 400 if teamId does not exist', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProject);
      (prisma.team.findUnique as any).mockResolvedValue(null);

      const token = generateToken(facultyUser);
      const response = await request(app)
        .patch('/api/projects/proj-uuid-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ teamId: 'nonexistent-team' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Team not found');
      expect(prisma.project.update).not.toHaveBeenCalled();
    });

    it('should return 400 if teamId is already assigned to another project', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProject);
      (prisma.team.findUnique as any).mockResolvedValue({
        id: 'team-uuid-2',
        name: 'Beta Team',
      });
      (prisma.project.findFirst as any).mockResolvedValue({
        id: 'other-proj-id',
        name: 'Other Project',
        teamId: 'team-uuid-2',
      });

      const token = generateToken(facultyUser);
      const response = await request(app)
        .patch('/api/projects/proj-uuid-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ teamId: 'team-uuid-2' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Team is already assigned to another project');
      expect(prisma.project.update).not.toHaveBeenCalled();
    });

    it('should allow FACULTY to update project information successfully via PUT', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProject);
      const updatedProject = {
        ...mockProject,
        name: 'Updated Capstone Name',
        description: 'Updated Description',
      };
      (prisma.project.update as any).mockResolvedValue(updatedProject);

      const token = generateToken(facultyUser);
      const response = await request(app)
        .put('/api/projects/proj-uuid-1')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Updated Capstone Name',
          description: 'Updated Description',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Project updated successfully');
      expect(response.body.data.name).toBe('Updated Capstone Name');
      expect(response.body.data.description).toBe('Updated Description');
      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: 'proj-uuid-1' },
        data: {
          name: 'Updated Capstone Name',
          description: 'Updated Description',
        },
        include: {
          faculty: {
            select: { id: true, name: true, email: true },
          },
          team: {
            select: { id: true, name: true },
          },
        },
      });
    });

    it('should allow designated TEAM_LEAD of project team to update project via PATCH', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProject);
      const updatedProject = {
        ...mockProject,
        name: 'Patched Name by Lead',
      };
      (prisma.project.update as any).mockResolvedValue(updatedProject);

      const token = generateToken(teamLeadUser);
      const response = await request(app)
        .patch('/api/projects/proj-uuid-1')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Patched Name by Lead',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Project updated successfully');
      expect(response.body.data.name).toBe('Patched Name by Lead');
      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: 'proj-uuid-1' },
        data: {
          name: 'Patched Name by Lead',
        },
        include: {
          faculty: {
            select: { id: true, name: true, email: true },
          },
          team: {
            select: { id: true, name: true },
          },
        },
      });
    });

    it('should allow unsetting optional fields by setting to null', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProject);
      const updatedProject = {
        ...mockProject,
        description: null,
        facultyId: null,
        teamId: null,
        faculty: null,
        team: null,
      };
      (prisma.project.update as any).mockResolvedValue(updatedProject);

      const token = generateToken(facultyUser);
      const response = await request(app)
        .put('/api/projects/proj-uuid-1')
        .set('Authorization', `Bearer ${token}`)
        .send({
          description: null,
          facultyId: null,
          teamId: null,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: 'proj-uuid-1' },
        data: {
          description: null,
          facultyId: null,
          teamId: null,
        },
        include: {
          faculty: {
            select: { id: true, name: true, email: true },
          },
          team: {
            select: { id: true, name: true },
          },
        },
      });
    });
  });

  describe('PATCH /api/projects/:id/members/:userId/role - Role Assignment', () => {
    const projectWithTeam = {
      ...mockProject,
      teamId: 'team-uuid-1',
      team: {
        id: 'team-uuid-1',
        name: 'Alpha Team',
        leadId: 'lead-uuid-1',
        members: [
          { teamId: 'team-uuid-1', userId: 'lead-uuid-1', role: Role.TEAM_LEAD },
          { teamId: 'team-uuid-1', userId: 'member-uuid-1', role: Role.TEAM_MEMBER },
        ],
      },
    };

    it('should return 401 if unauthenticated', async () => {
      const response = await request(app)
        .patch('/api/projects/proj-uuid-1/members/member-uuid-1/role')
        .send({ role: Role.TEAM_LEAD });

      expect(response.status).toBe(401);
    });

    it('should return 403 if requester is a regular TEAM_MEMBER', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(projectWithTeam);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .patch('/api/projects/proj-uuid-1/members/member-uuid-1/role')
        .set('Authorization', `Bearer ${token}`)
        .send({ role: Role.TEAM_LEAD });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('insufficient permissions');
    });

    it('should return 400 if invalid role is provided', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(projectWithTeam);

      const token = generateToken(facultyUser);
      const response = await request(app)
        .patch('/api/projects/proj-uuid-1/members/member-uuid-1/role')
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'INVALID_ROLE' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid member role');
    });

    it('should return 404 if target user is not in the project team', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(projectWithTeam);

      const token = generateToken(facultyUser);
      const response = await request(app)
        .patch('/api/projects/proj-uuid-1/members/nonexistent-member/role')
        .set('Authorization', `Bearer ${token}`)
        .send({ role: Role.TEAM_LEAD });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not a member');
    });

    it('should allow FACULTY to promote a member to TEAM_LEAD', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(projectWithTeam);
      (prisma.teamMember.update as any).mockResolvedValue({
        id: 'tm-uuid-1',
        teamId: 'team-uuid-1',
        userId: 'member-uuid-1',
        role: Role.TEAM_LEAD,
        user: {
          id: 'member-uuid-1',
          name: 'Charlie Member',
          email: 'charlie.member@example.com',
          role: Role.TEAM_MEMBER,
        },
      });
      (prisma.team.update as any).mockResolvedValue({});

      const token = generateToken(facultyUser);
      const response = await request(app)
        .patch('/api/projects/proj-uuid-1/members/member-uuid-1/role')
        .set('Authorization', `Bearer ${token}`)
        .send({ role: Role.TEAM_LEAD });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.role).toBe(Role.TEAM_LEAD);
      expect(prisma.teamMember.update).toHaveBeenCalledWith({
        where: {
          teamId_userId: {
            teamId: 'team-uuid-1',
            userId: 'member-uuid-1',
          },
        },
        data: { role: Role.TEAM_LEAD },
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      });
      expect(prisma.team.update).toHaveBeenCalledWith({
        where: { id: 'team-uuid-1' },
        data: { leadId: 'member-uuid-1' },
      });
    });

    it('should allow designated TEAM_LEAD to demote another member/lead to TEAM_MEMBER', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(projectWithTeam);
      (prisma.teamMember.update as any).mockResolvedValue({
        id: 'tm-uuid-2',
        teamId: 'team-uuid-1',
        userId: 'member-uuid-1',
        role: Role.TEAM_MEMBER,
        user: {
          id: 'member-uuid-1',
          name: 'Charlie Member',
          email: 'charlie.member@example.com',
          role: Role.TEAM_MEMBER,
        },
      });

      const token = generateToken(teamLeadUser);
      const response = await request(app)
        .patch('/api/projects/proj-uuid-1/members/member-uuid-1/role')
        .set('Authorization', `Bearer ${token}`)
        .send({ role: Role.TEAM_MEMBER });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.role).toBe(Role.TEAM_MEMBER);
    });
  });

  describe('GET /api/projects/:id/board', () => {
    it('should get project board successfully', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProject);
      (prisma.task.findMany as any).mockResolvedValue([
        { id: 'task-1', status: 'TODO', userStoryId: 'story-1' },
      ]);

      const token = generateToken(teamMemberUser);
      const response = await request(app)
        .get('/api/projects/proj-uuid-1/board')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.TODO).toHaveLength(1);
      expect(response.body.data.DONE).toHaveLength(0);
    });

    it('should return 403 if unauthorized user requests board', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(mockProject);
      const outsider = { id: 'outsider', email: 'out@test.com', role: Role.TEAM_MEMBER };
      const token = generateToken(outsider);

      const response = await request(app)
        .get('/api/projects/proj-uuid-1/board')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });
  });
});

