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

  /**
   * Helper to compute progress metrics for a given project object.
   */
  private static computeProjectProgress(project: any) {
    const milestones = project.milestones || [];
    const requirements = project.requirements || [];
    const userStories = project.userStories || [];
    const sprints = project.sprints || [];

    // Milestone stats
    const totalMilestones = milestones.length;
    const completedMilestones = milestones.filter((m: any) => m.status === 'COMPLETED').length;
    const inProgressMilestones = milestones.filter((m: any) => m.status === 'IN_PROGRESS').length;
    const upcomingMilestones = milestones.filter((m: any) => m.status === 'UPCOMING').length;
    const milestoneCompletionRate =
      totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

    // Task stats across all user stories
    const allTasks = userStories.flatMap((s: any) => s.tasks || []);
    const totalTasks = allTasks.length;
    const todoTasks = allTasks.filter((t: any) => t.status === 'TODO').length;
    const inProgressTasks = allTasks.filter((t: any) => t.status === 'IN_PROGRESS').length;
    const inReviewTasks = allTasks.filter((t: any) => t.status === 'IN_REVIEW').length;
    const doneTasks = allTasks.filter((t: any) => t.status === 'DONE').length;
    const taskCompletionRate =
      totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    // Requirement & Review stats
    const totalRequirements = requirements.length;
    const draftRequirements = requirements.filter((r: any) => r.status === 'DRAFT').length;
    const inReviewRequirements = requirements.filter((r: any) => r.status === 'IN_REVIEW').length;
    const approvedRequirements = requirements.filter((r: any) => r.status === 'APPROVED').length;
    const rejectedRequirements = requirements.filter((r: any) => r.status === 'REJECTED').length;
    const completedRequirements = requirements.filter((r: any) => r.status === 'COMPLETED').length;
    const pendingReviews = requirements.filter((r: any) => r.status === 'IN_REVIEW');

    // User Stories & Points stats
    const totalUserStories = userStories.length;
    const completedUserStories = userStories.filter((s: any) => s.status === 'COMPLETED').length;
    const totalStoryPoints = userStories.reduce((acc: number, s: any) => acc + (s.storyPoints || 0), 0);
    const completedStoryPoints = userStories
      .filter((s: any) => s.status === 'COMPLETED')
      .reduce((acc: number, s: any) => acc + (s.storyPoints || 0), 0);

    // Active Sprint
    const activeSprint = sprints.find((sp: any) => sp.status === 'ACTIVE') || null;

    // Overall Progress % calculation
    let overallProgress = 0;
    if (totalMilestones > 0 && totalTasks > 0) {
      overallProgress = Math.round((milestoneCompletionRate * 0.5) + (taskCompletionRate * 0.5));
    } else if (totalMilestones > 0) {
      overallProgress = milestoneCompletionRate;
    } else if (totalTasks > 0) {
      overallProgress = taskCompletionRate;
    }

    return {
      projectId: project.id,
      projectName: project.name,
      overallProgressPercentage: overallProgress,
      milestones: {
        total: totalMilestones,
        completed: completedMilestones,
        inProgress: inProgressMilestones,
        upcoming: upcomingMilestones,
        completionPercentage: milestoneCompletionRate,
      },
      tasks: {
        total: totalTasks,
        todo: todoTasks,
        inProgress: inProgressTasks,
        inReview: inReviewTasks,
        done: doneTasks,
        completionPercentage: taskCompletionRate,
      },
      requirements: {
        total: totalRequirements,
        draft: draftRequirements,
        inReview: inReviewRequirements,
        approved: approvedRequirements,
        rejected: rejectedRequirements,
        completed: completedRequirements,
        pendingReviewCount: inReviewRequirements,
        pendingReviews: pendingReviews.map((r: any) => ({
          id: r.id,
          title: r.title,
          priority: r.priority,
          type: r.type,
          version: r.version,
          createdAt: r.createdAt,
        })),
      },
      userStories: {
        total: totalUserStories,
        completed: completedUserStories,
        totalStoryPoints,
        completedStoryPoints,
      },
      activeSprint: activeSprint
        ? {
            id: activeSprint.id,
            name: activeSprint.name,
            startDate: activeSprint.startDate,
            endDate: activeSprint.endDate,
            status: activeSprint.status,
          }
        : null,
    };
  }

  /**
   * Retrieve aggregated progress data for a single project.
   */
  public static async getProjectProgressData(
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
        milestones: true,
        requirements: true,
        userStories: {
          include: {
            tasks: true,
          },
        },
        sprints: true,
      },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    return this.computeProjectProgress(project);
  }

  /**
   * Retrieve aggregated progress data across all projects overseen by a faculty member.
   */
  public static async getAllOverseenProgressData(
    facultyId: string,
    user: { id: string; role: Role }
  ) {
    if (!facultyId || typeof facultyId !== 'string' || !facultyId.trim()) {
      throw new AppError('Faculty ID is required', 400);
    }

    if (user.role !== Role.FACULTY) {
      throw new AppError('Access denied: faculty role required', 403);
    }

    const projects = await prisma.project.findMany({
      where: { facultyId: facultyId.trim() },
      include: {
        milestones: true,
        requirements: true,
        userStories: {
          include: {
            tasks: true,
          },
        },
        sprints: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const projectProgressList = projects.map((p) => this.computeProjectProgress(p));

    const totalProjects = projectProgressList.length;
    const totalMilestones = projectProgressList.reduce((acc, p) => acc + p.milestones.total, 0);
    const completedMilestones = projectProgressList.reduce((acc, p) => acc + p.milestones.completed, 0);
    const totalTasks = projectProgressList.reduce((acc, p) => acc + p.tasks.total, 0);
    const doneTasks = projectProgressList.reduce((acc, p) => acc + p.tasks.done, 0);
    const totalPendingReviews = projectProgressList.reduce((acc, p) => acc + p.requirements.pendingReviewCount, 0);

    const overallAverageProgress =
      totalProjects > 0
        ? Math.round(
            projectProgressList.reduce((acc, p) => acc + p.overallProgressPercentage, 0) /
              totalProjects
          )
        : 0;

    return {
      facultyId: facultyId.trim(),
      totalProjects,
      summary: {
        totalMilestones,
        completedMilestones,
        totalTasks,
        doneTasks,
        totalPendingReviews,
        overallAverageProgress,
      },
      projects: projectProgressList,
    };
  }

  /**
   * Retrieve combined monitoring dashboard response for faculty.
   */
  public static async getFacultyDashboard(
    facultyId: string,
    user: { id: string; role: Role }
  ) {
    if (!facultyId || typeof facultyId !== 'string' || !facultyId.trim()) {
      throw new AppError('Faculty ID is required', 400);
    }

    if (user.role !== Role.FACULTY) {
      throw new AppError('Access denied: faculty role required', 403);
    }

    const faculty = await prisma.user.findUnique({
      where: { id: facultyId.trim() },
      select: { id: true, name: true, email: true, role: true },
    });

    if (!faculty) {
      throw new AppError('Faculty user not found', 404);
    }

    // Fetch projects with all relations needed for dashboard
    const projects = await prisma.project.findMany({
      where: { facultyId: faculty.id },
      include: {
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
          orderBy: { createdAt: 'asc' },
        },
        requirements: {
          orderBy: { createdAt: 'asc' },
        },
        userStories: {
          include: {
            tasks: true,
          },
        },
        sprints: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Compute progress for each project
    const projectProgressList = projects.map((p) => {
      const progress = this.computeProjectProgress(p);
      return {
        ...progress,
        team: p.team
          ? {
              id: p.team.id,
              name: p.team.name,
              lead: p.team.lead,
              memberCount: p.team.members.length,
            }
          : null,
      };
    });

    // Collect all pending reviews across projects
    const pendingReviews: {
      projectId: string;
      projectName: string;
      requirementId: string;
      title: string;
      priority: string;
      type: string;
      version: number;
      createdAt: Date;
    }[] = [];

    projects.forEach((p) => {
      (p.requirements || []).forEach((r) => {
        if (r.status === 'IN_REVIEW') {
          pendingReviews.push({
            projectId: p.id,
            projectName: p.name,
            requirementId: r.id,
            title: r.title,
            priority: r.priority,
            type: r.type,
            version: r.version,
            createdAt: r.createdAt,
          });
        }
      });
    });

    // Collect upcoming deadlines / milestones across projects
    const upcomingDeadlines: {
      projectId: string;
      projectName: string;
      milestoneId: string;
      title: string;
      status: string;
      dueDate: Date | null;
    }[] = [];

    projects.forEach((p) => {
      (p.milestones || []).forEach((m) => {
        if (m.status !== 'COMPLETED') {
          upcomingDeadlines.push({
            projectId: p.id,
            projectName: p.name,
            milestoneId: m.id,
            title: m.title,
            status: m.status,
            dueDate: m.dueDate,
          });
        }
      });
    });

    // Recent activity logs for overseen projects
    const projectIds = projects.map((p) => p.id);
    const recentActivity = await prisma.activityLog.findMany({
      where: {
        projectId: { in: projectIds },
      },
      include: {
        actor: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // Unread notifications for faculty
    const unreadNotificationsCount = await prisma.notification.count({
      where: {
        userId: faculty.id,
        read: false,
      },
    });

    // Compute summary metrics
    const totalProjects = projectProgressList.length;
    const totalMilestones = projectProgressList.reduce((acc, p) => acc + p.milestones.total, 0);
    const completedMilestones = projectProgressList.reduce((acc, p) => acc + p.milestones.completed, 0);
    const totalTasks = projectProgressList.reduce((acc, p) => acc + p.tasks.total, 0);
    const doneTasks = projectProgressList.reduce((acc, p) => acc + p.tasks.done, 0);
    const totalPendingReviews = pendingReviews.length;

    const overallAverageProgress =
      totalProjects > 0
        ? Math.round(
            projectProgressList.reduce((acc, p) => acc + p.overallProgressPercentage, 0) /
              totalProjects
          )
        : 0;

    return {
      faculty,
      summary: {
        totalProjects,
        totalMilestones,
        completedMilestones,
        totalTasks,
        doneTasks,
        pendingReviewsCount: totalPendingReviews,
        unreadNotificationsCount,
        overallAverageProgress,
      },
      projects: projectProgressList,
      pendingReviews,
      upcomingDeadlines,
      recentActivity,
    };
  }
}
