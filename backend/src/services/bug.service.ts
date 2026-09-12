import { prisma } from '../lib/prisma';
import { Role, BugPriority, BugSeverity, BugStatus } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';

export interface CreateBugDto {
  title: string;
  description?: string;
  priority?: BugPriority;
  severity?: BugSeverity;
  status?: BugStatus;
  projectId: string;
  requirementId?: string;
  userStoryId?: string;
  taskId?: string;
  sprintId?: string;
  pullRequestUrl?: string;
  prNumber?: number;
  assigneeId?: string;
}

export interface UpdateBugDto {
  title?: string;
  description?: string;
  priority?: BugPriority;
  severity?: BugSeverity;
  status?: BugStatus;
  requirementId?: string | null;
  userStoryId?: string | null;
  taskId?: string | null;
  sprintId?: string | null;
  pullRequestUrl?: string | null;
  prNumber?: number | null;
  assigneeId?: string | null;
}

export interface BugFilters {
  status?: BugStatus;
  priority?: BugPriority;
  severity?: BugSeverity;
  requirementId?: string;
  userStoryId?: string;
  taskId?: string;
  sprintId?: string;
  assigneeId?: string;
}

export class BugService {
  private static canAccessProject(user: { id: string; role: Role }, project: any): boolean {
    if (user.role === Role.FACULTY) {
      return !project.facultyId || project.facultyId === user.id;
    }
    if (project.team) {
      if (project.team.leadId === user.id) return true;
      if (project.team.members && project.team.members.some((m: any) => m.userId === user.id)) return true;
    }
    return false;
  }

  public static async createBug(data: CreateBugDto, user: { id: string; role: Role }) {
    if (!data.title || !data.title.trim()) {
      throw new AppError('Bug title is required', 400);
    }
    if (!data.projectId || !data.projectId.trim()) {
      throw new AppError('Project ID is required', 400);
    }

    const project = await prisma.project.findUnique({
      where: { id: data.projectId.trim() },
      include: { team: { include: { members: true } } },
    });

    if (!project) throw new AppError('Project not found', 404);
    if (!this.canAccessProject(user, project)) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    // Validate requirement belongs to project
    if (data.requirementId) {
      const req = await prisma.requirement.findUnique({
        where: { id: data.requirementId.trim() },
      });
      if (!req) throw new AppError('Requirement not found', 404);
      if (req.projectId !== project.id) {
        throw new AppError('Requirement does not belong to this project', 400);
      }
    }

    // Validate user story belongs to project
    if (data.userStoryId) {
      const story = await prisma.userStory.findUnique({
        where: { id: data.userStoryId.trim() },
      });
      if (!story) throw new AppError('User Story not found', 404);
      if (story.projectId !== project.id) {
        throw new AppError('User Story does not belong to this project', 400);
      }
    }

    // Validate task belongs to project
    if (data.taskId) {
      const task = await prisma.task.findUnique({
        where: { id: data.taskId.trim() },
        include: { userStory: true },
      });
      if (!task) throw new AppError('Task not found', 404);
      if (task.userStory.projectId !== project.id) {
        throw new AppError('Task does not belong to this project', 400);
      }
    }

    // Validate sprint belongs to project
    if (data.sprintId) {
      const sprint = await prisma.sprint.findUnique({
        where: { id: data.sprintId.trim() },
      });
      if (!sprint) throw new AppError('Sprint not found', 404);
      if (sprint.projectId !== project.id) {
        throw new AppError('Sprint does not belong to this project', 400);
      }
    }

    // Validate assignee
    if (data.assigneeId) {
      const assignee = await prisma.user.findUnique({
        where: { id: data.assigneeId.trim() },
      });
      if (!assignee) throw new AppError('Assignee user not found', 404);
    }

    const bug = await prisma.bug.create({
      data: {
        title: data.title.trim(),
        description: data.description?.trim() || null,
        priority: data.priority || BugPriority.MEDIUM,
        severity: data.severity || BugSeverity.MEDIUM,
        status: data.status || BugStatus.OPEN,
        projectId: project.id,
        requirementId: data.requirementId?.trim() || null,
        userStoryId: data.userStoryId?.trim() || null,
        taskId: data.taskId?.trim() || null,
        sprintId: data.sprintId?.trim() || null,
        pullRequestUrl: data.pullRequestUrl?.trim() || null,
        prNumber: data.prNumber ?? null,
        reporterId: user.id,
        assigneeId: data.assigneeId?.trim() || null,
      },
      include: {
        reporter: { select: { id: true, name: true, email: true, role: true } },
        assignee: { select: { id: true, name: true, email: true, role: true } },
        requirement: { select: { id: true, title: true, status: true, priority: true } },
        userStory: { select: { id: true, title: true, status: true, priority: true } },
        task: { select: { id: true, title: true, status: true } },
        sprint: { select: { id: true, name: true, status: true } },
      },
    });

    return bug;
  }

  public static async getBugsByProject(
    projectId: string,
    user: { id: string; role: Role },
    filters?: BugFilters
  ) {
    if (!projectId || !projectId.trim()) throw new AppError('Project ID is required', 400);

    const project = await prisma.project.findUnique({
      where: { id: projectId.trim() },
      include: { team: { include: { members: true } } },
    });

    if (!project) throw new AppError('Project not found', 404);
    if (!this.canAccessProject(user, project)) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    const where: any = { projectId: project.id };
    if (filters?.status) where.status = filters.status;
    if (filters?.priority) where.priority = filters.priority;
    if (filters?.severity) where.severity = filters.severity;
    if (filters?.requirementId) where.requirementId = filters.requirementId;
    if (filters?.userStoryId) where.userStoryId = filters.userStoryId;
    if (filters?.taskId) where.taskId = filters.taskId;
    if (filters?.sprintId) where.sprintId = filters.sprintId;
    if (filters?.assigneeId) where.assigneeId = filters.assigneeId;

    return prisma.bug.findMany({
      where,
      include: {
        reporter: { select: { id: true, name: true, email: true, role: true } },
        assignee: { select: { id: true, name: true, email: true, role: true } },
        requirement: { select: { id: true, title: true, status: true, priority: true } },
        userStory: { select: { id: true, title: true, status: true, priority: true } },
        task: { select: { id: true, title: true, status: true } },
        sprint: { select: { id: true, name: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  public static async getBugById(bugId: string, user: { id: string; role: Role }) {
    if (!bugId || !bugId.trim()) throw new AppError('Bug ID is required', 400);

    const bug = await prisma.bug.findUnique({
      where: { id: bugId.trim() },
      include: {
        project: { include: { team: { include: { members: true } } } },
        reporter: { select: { id: true, name: true, email: true, role: true } },
        assignee: { select: { id: true, name: true, email: true, role: true } },
        requirement: { select: { id: true, title: true, description: true, status: true, priority: true } },
        userStory: { select: { id: true, title: true, description: true, status: true, priority: true } },
        task: { select: { id: true, title: true, description: true, status: true } },
        sprint: { select: { id: true, name: true, status: true, startDate: true, endDate: true } },
      },
    });

    if (!bug) throw new AppError('Bug not found', 404);
    if (!this.canAccessProject(user, bug.project)) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    return bug;
  }

  public static async updateBug(bugId: string, data: UpdateBugDto, user: { id: string; role: Role }) {
    if (!bugId || !bugId.trim()) throw new AppError('Bug ID is required', 400);

    const bug = await prisma.bug.findUnique({
      where: { id: bugId.trim() },
      include: { project: { include: { team: { include: { members: true } } } } },
    });

    if (!bug) throw new AppError('Bug not found', 404);
    if (!this.canAccessProject(user, bug.project)) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title.trim();
    if (data.description !== undefined) updateData.description = data.description?.trim() || null;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.severity !== undefined) updateData.severity = data.severity;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.pullRequestUrl !== undefined) updateData.pullRequestUrl = data.pullRequestUrl?.trim() || null;
    if (data.prNumber !== undefined) updateData.prNumber = data.prNumber;

    if (data.requirementId !== undefined) {
      if (data.requirementId) {
        const req = await prisma.requirement.findUnique({ where: { id: data.requirementId.trim() } });
        if (!req) throw new AppError('Requirement not found', 404);
        if (req.projectId !== bug.projectId) throw new AppError('Requirement does not belong to this project', 400);
        updateData.requirementId = req.id;
      } else {
        updateData.requirementId = null;
      }
    }

    if (data.userStoryId !== undefined) {
      if (data.userStoryId) {
        const story = await prisma.userStory.findUnique({ where: { id: data.userStoryId.trim() } });
        if (!story) throw new AppError('User Story not found', 404);
        if (story.projectId !== bug.projectId) throw new AppError('User Story does not belong to this project', 400);
        updateData.userStoryId = story.id;
      } else {
        updateData.userStoryId = null;
      }
    }

    if (data.taskId !== undefined) {
      if (data.taskId) {
        const task = await prisma.task.findUnique({
          where: { id: data.taskId.trim() },
          include: { userStory: true },
        });
        if (!task) throw new AppError('Task not found', 404);
        if (task.userStory.projectId !== bug.projectId) throw new AppError('Task does not belong to this project', 400);
        updateData.taskId = task.id;
      } else {
        updateData.taskId = null;
      }
    }

    if (data.sprintId !== undefined) {
      if (data.sprintId) {
        const sprint = await prisma.sprint.findUnique({ where: { id: data.sprintId.trim() } });
        if (!sprint) throw new AppError('Sprint not found', 404);
        if (sprint.projectId !== bug.projectId) throw new AppError('Sprint does not belong to this project', 400);
        updateData.sprintId = sprint.id;
      } else {
        updateData.sprintId = null;
      }
    }

    if (data.assigneeId !== undefined) {
      if (data.assigneeId) {
        const assignee = await prisma.user.findUnique({ where: { id: data.assigneeId.trim() } });
        if (!assignee) throw new AppError('Assignee user not found', 404);
        updateData.assigneeId = assignee.id;
      } else {
        updateData.assigneeId = null;
      }
    }

    return prisma.bug.update({
      where: { id: bug.id },
      data: updateData,
      include: {
        reporter: { select: { id: true, name: true, email: true, role: true } },
        assignee: { select: { id: true, name: true, email: true, role: true } },
        requirement: { select: { id: true, title: true, status: true, priority: true } },
        userStory: { select: { id: true, title: true, status: true, priority: true } },
        task: { select: { id: true, title: true, status: true } },
        sprint: { select: { id: true, name: true, status: true } },
      },
    });
  }

  public static async deleteBug(bugId: string, user: { id: string; role: Role }) {
    if (!bugId || !bugId.trim()) throw new AppError('Bug ID is required', 400);

    const bug = await prisma.bug.findUnique({
      where: { id: bugId.trim() },
      include: { project: { include: { team: { include: { members: true } } } } },
    });

    if (!bug) throw new AppError('Bug not found', 404);
    if (!this.canAccessProject(user, bug.project)) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    await prisma.bug.delete({ where: { id: bug.id } });
    return { message: 'Bug deleted successfully' };
  }

  public static async getBugTraceability(bugId: string, user: { id: string; role: Role }) {
    if (!bugId || !bugId.trim()) throw new AppError('Bug ID is required', 400);

    const bug = await prisma.bug.findUnique({
      where: { id: bugId.trim() },
      include: {
        project: { include: { team: { include: { members: true } } } },
        requirement: {
          include: {
            userStories: {
              include: {
                userStory: {
                  include: {
                    tasks: true,
                    sprint: true,
                  },
                },
              },
            },
          },
        },
        userStory: {
          include: {
            requirements: { include: { requirement: true } },
            tasks: true,
            sprint: true,
          },
        },
        task: {
          include: {
            userStory: {
              include: {
                requirements: { include: { requirement: true } },
                sprint: true,
              },
            },
            sprint: true,
          },
        },
        sprint: true,
        reporter: { select: { id: true, name: true, email: true, role: true } },
        assignee: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    if (!bug) throw new AppError('Bug not found', 404);
    if (!this.canAccessProject(user, bug.project)) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    return {
      bug: {
        id: bug.id,
        title: bug.title,
        description: bug.description,
        status: bug.status,
        priority: bug.priority,
        severity: bug.severity,
        pullRequestUrl: bug.pullRequestUrl,
        prNumber: bug.prNumber,
        createdAt: bug.createdAt,
        updatedAt: bug.updatedAt,
      },
      project: {
        id: bug.project.id,
        name: bug.project.name,
      },
      requirement: bug.requirement,
      userStory: bug.userStory,
      task: bug.task,
      sprint: bug.sprint,
      reporter: bug.reporter,
      assignee: bug.assignee,
    };
  }
}
