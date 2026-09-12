import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

export interface FacultyProjectsQueryDTO {
  page?: number;
  pageSize?: number;
}

export class FacultyService {
  /**
   * Retrieve all projects overseen by a faculty member with basic project information and summary counts.
   */
  public static async getOverseenProjects(
    facultyId: string,
    user: { id: string; role: Role },
    query?: FacultyProjectsQueryDTO
  ) {
    if (!facultyId || typeof facultyId !== 'string' || !facultyId.trim()) {
      throw new AppError('Faculty ID is required', 400);
    }

    // Role-based authorization: Only FACULTY users can access faculty project overviews
    if (user.role !== Role.FACULTY) {
      throw new AppError('Access denied: faculty role required', 403);
    }

    const page = query?.page && query.page > 0 ? query.page : 1;
    const pageSize = query?.pageSize && query.pageSize > 0 ? query.pageSize : 20;
    const skip = (page - 1) * pageSize;

    const where = { facultyId: facultyId.trim() };

    const [totalCount, projects] = await Promise.all([
      prisma.project.count({ where }),
      prisma.project.findMany({
        where,
        include: {
          faculty: {
            select: { id: true, name: true, email: true, role: true },
          },
          team: {
            include: {
              lead: { select: { id: true, name: true, email: true } },
              members: {
                include: {
                  user: { select: { id: true, name: true, email: true, role: true } },
                },
              },
            },
          },
          _count: {
            select: {
              milestones: true,
              requirements: true,
              userStories: true,
              sprints: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    const formattedProjects = projects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      faculty: p.faculty,
      team: p.team
        ? {
            id: p.team.id,
            name: p.team.name,
            lead: p.team.lead,
            memberCount: p.team.members.length,
            members: p.team.members.map((m) => ({
              userId: m.userId,
              name: m.user.name,
              email: m.user.email,
              teamRole: m.role,
            })),
          }
        : null,
      summary: {
        totalMilestones: p._count.milestones,
        totalRequirements: p._count.requirements,
        totalUserStories: p._count.userStories,
        totalSprints: p._count.sprints,
      },
    }));

    return {
      totalCount,
      page,
      pageSize,
      projects: formattedProjects,
    };
  }

  /**
   * Retrieve detailed overview of a single project overseen by faculty.
   */
  public static async getOverseenProjectDetail(
    projectId: string,
    user: { id: string; role: Role }
  ) {
    if (!projectId || typeof projectId !== 'string' || !projectId.trim()) {
      throw new AppError('Project ID is required', 400);
    }

    if (user.role !== Role.FACULTY) {
      throw new AppError('Access denied: faculty role required', 403);
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId.trim() },
      include: {
        faculty: {
          select: { id: true, name: true, email: true, role: true },
        },
        team: {
          include: {
            lead: { select: { id: true, name: true, email: true } },
            members: {
              include: {
                user: { select: { id: true, name: true, email: true, role: true } },
              },
            },
          },
        },
        milestones: {
          select: { id: true, title: true, status: true, dueDate: true },
          orderBy: { createdAt: 'asc' },
        },
        requirements: {
          select: { id: true, title: true, status: true, priority: true, type: true },
          orderBy: { createdAt: 'asc' },
        },
        _count: {
          select: {
            milestones: true,
            requirements: true,
            userStories: true,
            sprints: true,
          },
        },
      },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    return {
      id: project.id,
      name: project.name,
      description: project.description,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      faculty: project.faculty,
      team: project.team
        ? {
            id: project.team.id,
            name: project.team.name,
            lead: project.team.lead,
            members: project.team.members.map((m) => ({
              userId: m.userId,
              name: m.user.name,
              email: m.user.email,
              teamRole: m.role,
            })),
          }
        : null,
      milestones: project.milestones,
      requirements: project.requirements,
      summary: {
        totalMilestones: project._count.milestones,
        totalRequirements: project._count.requirements,
        totalUserStories: project._count.userStories,
        totalSprints: project._count.sprints,
      },
    };
  }
}
