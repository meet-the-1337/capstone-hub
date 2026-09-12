import { prisma } from '../lib/prisma';
import { Role } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';

export interface UpdateProjectDTO {
  name?: string;
  description?: string | null;
  facultyId?: string | null;
  teamId?: string | null;
}

export class ProjectService {
  public static async createProject(data: { name: string; description?: string; teamId?: string }, user: { id: string; role: Role }) {
    const projectData: any = {
      name: data.name,
      description: data.description,
    };

    if (user.role === Role.FACULTY) {
      projectData.facultyId = user.id;
    }

    if (data.teamId) {
      projectData.teamId = data.teamId;
    }

    return prisma.project.create({
      data: projectData,
    });
  }

  public static async getProjects() {
    return prisma.project.findMany({
      include: {
        faculty: {
          select: { id: true, name: true, email: true },
        },
        team: {
          select: { id: true, name: true },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  public static async getProjectById(id: string) {
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        faculty: {
          select: { id: true, name: true, email: true },
        },
        team: {
          select: { id: true, name: true },
        },
      },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    return project;
  }

  public static async updateProject(
    id: string,
    data: UpdateProjectDTO,
    user: { id: string; role: Role }
  ) {
    const existingProject = await prisma.project.findUnique({
      where: { id },
      include: {
        team: {
          include: {
            members: true,
          },
        },
      },
    });

    if (!existingProject) {
      throw new AppError('Project not found', 404);
    }

    // Authorization check:
    // 1. Faculty users can update projects.
    // 2. Team leads of the assigned team can update the project.
    const isFaculty = user.role === Role.FACULTY;
    const isTeamLead =
      existingProject.team &&
      (existingProject.team.leadId === user.id ||
        existingProject.team.members.some(
          (m) => m.userId === user.id && m.role === Role.TEAM_LEAD
        ));

    if (!isFaculty && !isTeamLead) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    const { name, description, facultyId, teamId } = data;

    if (
      name === undefined &&
      description === undefined &&
      facultyId === undefined &&
      teamId === undefined
    ) {
      throw new AppError('At least one field must be provided to update', 400);
    }

    const updateData: {
      name?: string;
      description?: string | null;
      facultyId?: string | null;
      teamId?: string | null;
    } = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        throw new AppError('Project name cannot be empty', 400);
      }
      updateData.name = name.trim();
    }

    if (description !== undefined) {
      if (description !== null && typeof description !== 'string') {
        throw new AppError('Description must be a string or null', 400);
      }
      updateData.description = description !== null ? description.trim() : null;
    }

    if (facultyId !== undefined) {
      if (facultyId !== null) {
        if (typeof facultyId !== 'string' || !facultyId.trim()) {
          throw new AppError('Invalid facultyId format', 400);
        }
        const facultyUser = await prisma.user.findUnique({
          where: { id: facultyId },
        });
        if (!facultyUser) {
          throw new AppError('Faculty user not found', 400);
        }
        if (facultyUser.role !== Role.FACULTY) {
          throw new AppError('Assigned user must have FACULTY role', 400);
        }
        updateData.facultyId = facultyId;
      } else {
        updateData.facultyId = null;
      }
    }

    if (teamId !== undefined) {
      if (teamId !== null) {
        if (typeof teamId !== 'string' || !teamId.trim()) {
          throw new AppError('Invalid teamId format', 400);
        }
        const team = await prisma.team.findUnique({
          where: { id: teamId },
        });
        if (!team) {
          throw new AppError('Team not found', 400);
        }
        const conflictingProject = await prisma.project.findFirst({
          where: {
            teamId,
            NOT: { id },
          },
        });
        if (conflictingProject) {
          throw new AppError('Team is already assigned to another project', 400);
        }
        updateData.teamId = teamId;
      } else {
        updateData.teamId = null;
      }
    }

    return prisma.project.update({
      where: { id },
      data: updateData,
      include: {
        faculty: {
          select: { id: true, name: true, email: true },
        },
        team: {
          select: { id: true, name: true },
        },
      },
    });
  }

  public static async addTeamMember(
    projectId: string,
    data: { userId?: string; role?: Role },
    user: { id: string; role: Role }
  ) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        team: {
          include: {
            members: true,
          },
        },
      },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    if (!project.teamId || !project.team) {
      throw new AppError('Project does not have an assigned team', 400);
    }

    const isFaculty = user.role === Role.FACULTY;
    const isTeamLead =
      project.team.leadId === user.id ||
      project.team.members.some(
        (m) => m.userId === user.id && m.role === Role.TEAM_LEAD
      );

    if (!isFaculty && !isTeamLead) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    const { userId, role } = data;

    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      throw new AppError('User ID is required', 400);
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId.trim() },
    });

    if (!targetUser) {
      throw new AppError('User not found', 404);
    }

    if (targetUser.role === Role.FACULTY) {
      throw new AppError('Faculty users cannot be added as team members', 400);
    }

    let memberRole: Role = Role.TEAM_MEMBER;
    if (role !== undefined) {
      if (role !== Role.TEAM_MEMBER && role !== Role.TEAM_LEAD) {
        throw new AppError('Invalid member role. Allowed roles: TEAM_MEMBER, TEAM_LEAD', 400);
      }
      memberRole = role;
    }

    const existingMember = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId: project.teamId,
          userId: targetUser.id,
        },
      },
    });

    if (existingMember) {
      throw new AppError('User is already a member of this project team', 409);
    }

    const newMember = await prisma.teamMember.create({
      data: {
        teamId: project.teamId,
        userId: targetUser.id,
        role: memberRole,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });

    if (memberRole === Role.TEAM_LEAD && !project.team.leadId) {
      await prisma.team.update({
        where: { id: project.teamId },
        data: { leadId: targetUser.id },
      });
    }

    return newMember;
  }

  public static async removeTeamMember(
    projectId: string,
    memberUserId: string,
    user: { id: string; role: Role }
  ) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        team: {
          include: {
            members: true,
          },
        },
      },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    if (!project.teamId || !project.team) {
      throw new AppError('Project does not have an assigned team', 400);
    }

    if (!memberUserId || typeof memberUserId !== 'string' || !memberUserId.trim()) {
      throw new AppError('Member user ID is required', 400);
    }

    const targetUserId = memberUserId.trim();

    const isMember = project.team.members.some((m) => m.userId === targetUserId);
    if (!isMember) {
      throw new AppError('User is not a member of this project team', 404);
    }

    const isFaculty = user.role === Role.FACULTY;
    const isTeamLead =
      project.team.leadId === user.id ||
      project.team.members.some(
        (m) => m.userId === user.id && m.role === Role.TEAM_LEAD
      );
    const isSelf = user.id === targetUserId;

    if (!isFaculty && !isTeamLead && !isSelf) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    await prisma.teamMember.delete({
      where: {
        teamId_userId: {
          teamId: project.teamId,
          userId: targetUserId,
        },
      },
    });

    if (project.team.leadId === targetUserId) {
      await prisma.team.update({
        where: { id: project.teamId },
        data: { leadId: null },
      });
    }

    return { message: 'Team member removed successfully' };
  }

  /**
   * Retrieve team members for a project with optional pagination.
   * @param projectId - ID of the project.
   * @param pagination - Optional pagination options { page, pageSize }.
   * @returns An object containing total count and a page of members.
   */
  public static async getTeamMembers(
    projectId: string,
    pagination?: { page?: number; pageSize?: number }
  ) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        team: {
          include: {
            members: {
              include: {
                user: {
                  select: { id: true, name: true, email: true, role: true },
                },
              },
            },
          },
        },
      },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    if (!project.teamId || !project.team) {
      throw new AppError('Project does not have an assigned team', 400);
    }

    const page = pagination?.page && pagination.page > 0 ? pagination.page : 1;
    const pageSize = pagination?.pageSize && pagination.pageSize > 0 ? pagination.pageSize : 10;
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const totalCount = await prisma.teamMember.count({ where: { teamId: project.teamId } });
    const members = await prisma.teamMember.findMany({
      where: { teamId: project.teamId },
      skip,
      take,
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    return { totalCount, page, pageSize, members };
  }

  /**
   * Assign or change a team member's role within a project team.
   * Enforces RBAC so only FACULTY or project TEAM_LEAD can perform role changes.
   *
   * @param projectId - ID of the project
   * @param memberUserId - User ID of the team member whose role is being changed
   * @param data - Role update data { role?: Role }
   * @param user - Current authenticated actor { id, role }
   * @returns Updated team member record
   */
  public static async updateMemberRole(
    projectId: string,
    memberUserId: string,
    data: { role?: Role },
    user: { id: string; role: Role }
  ) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        team: {
          include: {
            members: true,
          },
        },
      },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    if (!project.teamId || !project.team) {
      throw new AppError('Project does not have an assigned team', 400);
    }

    const isFaculty = user.role === Role.FACULTY;
    const isTeamLead =
      project.team.leadId === user.id ||
      project.team.members.some(
        (m) => m.userId === user.id && m.role === Role.TEAM_LEAD
      );

    if (!isFaculty && !isTeamLead) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    if (!memberUserId || typeof memberUserId !== 'string' || !memberUserId.trim()) {
      throw new AppError('Member user ID is required', 400);
    }

    const targetUserId = memberUserId.trim();

    const existingMember = project.team.members.find((m) => m.userId === targetUserId);
    if (!existingMember) {
      throw new AppError('User is not a member of this project team', 404);
    }

    const { role } = data;
    if (!role || (role !== Role.TEAM_MEMBER && role !== Role.TEAM_LEAD)) {
      throw new AppError('Invalid member role. Allowed roles: TEAM_MEMBER, TEAM_LEAD', 400);
    }

    const updatedMember = await prisma.teamMember.update({
      where: {
        teamId_userId: {
          teamId: project.teamId,
          userId: targetUserId,
        },
      },
      data: {
        role,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });

    // Sync team lead on Team entity
    if (role === Role.TEAM_LEAD && project.team.leadId !== targetUserId) {
      await prisma.team.update({
        where: { id: project.teamId },
        data: { leadId: targetUserId },
      });
    } else if (role === Role.TEAM_MEMBER && project.team.leadId === targetUserId) {
      const otherLead = project.team.members.find(
        (m) => m.userId !== targetUserId && m.role === Role.TEAM_LEAD
      );
      await prisma.team.update({
        where: { id: project.teamId },
        data: { leadId: otherLead ? otherLead.userId : null },
      });
    }

    return updatedMember;
  }

  public static async getProjectBoard(projectId: string, user?: { id: string; role: Role }) {
    if (!projectId || !projectId.trim()) throw new AppError('Project ID is required', 400);
    const project = await prisma.project.findUnique({
      where: { id: projectId.trim() },
      include: { team: { include: { members: true } } },
    });
    if (!project) throw new AppError('Project not found', 404);
    
    if (user) {
      const isFaculty = user.role === Role.FACULTY || project.facultyId === user.id;
      const isTeamMember = project.team && (project.team.leadId === user.id || project.team.members.some(m => m.userId === user.id));
      if (!isFaculty && !isTeamMember) {
        throw new AppError('Access denied: insufficient permissions', 403);
      }
    }

    const tasks = await prisma.task.findMany({
      where: { userStory: { projectId: project.id } },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        userStory: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      TODO: tasks.filter((t) => t.status === 'TODO'),
      IN_PROGRESS: tasks.filter((t) => t.status === 'IN_PROGRESS'),
      IN_REVIEW: tasks.filter((t) => t.status === 'IN_REVIEW'),
      DONE: tasks.filter((t) => t.status === 'DONE'),
    };
  }
}


