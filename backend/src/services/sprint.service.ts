import { Role, SprintStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

export interface CreateSprintDTO {
  name: string;
  startDate: string | Date;
  endDate: string | Date;
  status?: SprintStatus;
}

export interface UpdateSprintDTO {
  name?: string;
  startDate?: string | Date;
  endDate?: string | Date;
  status?: SprintStatus;
}

export class SprintService {
  private static canAccessProject(
    user: { id: string; role: Role },
    project: {
      id: string;
      facultyId: string | null;
      teamId: string | null;
      team: {
        leadId: string | null;
        members: { userId: string; role: Role }[];
      } | null;
    }
  ): boolean {
    if (user.role === Role.FACULTY || project.facultyId === user.id) {
      return true;
    }
    if (!project.team) {
      return false;
    }
    return (
      project.team.leadId === user.id ||
      project.team.members.some((m) => m.userId === user.id)
    );
  }

  public static async createSprint(projectId: string, data: CreateSprintDTO, user: { id: string; role: Role }) {
    if (!projectId || !projectId.trim()) throw new AppError('Project ID is required', 400);
    const project = await prisma.project.findUnique({
      where: { id: projectId.trim() },
      include: { team: { include: { members: true } } },
    });
    if (!project) throw new AppError('Project not found', 404);
    if (!this.canAccessProject(user, project)) throw new AppError('Access denied: insufficient permissions', 403);

    const { name, startDate, endDate, status } = data;
    if (!name || !name.trim()) throw new AppError('Sprint name is required', 400);
    
    const parsedStartDate = new Date(startDate);
    const parsedEndDate = new Date(endDate);
    if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
      throw new AppError('Invalid start or end date', 400);
    }
    if (parsedStartDate > parsedEndDate) {
      throw new AppError('Start date must be before end date', 400);
    }

    let sprintStatus: SprintStatus = SprintStatus.PLANNED;
    if (status !== undefined) {
      if (!Object.values(SprintStatus).includes(status)) {
        throw new AppError(`Invalid status. Allowed: ${Object.values(SprintStatus).join(', ')}`, 400);
      }
      sprintStatus = status;
    }

    return prisma.sprint.create({
      data: {
        name: name.trim(),
        startDate: parsedStartDate,
        endDate: parsedEndDate,
        status: sprintStatus,
        projectId: project.id,
      },
    });
  }

  public static async getSprintsByProjectId(projectId: string, user?: { id: string; role: Role }) {
    if (!projectId || !projectId.trim()) throw new AppError('Project ID is required', 400);
    const project = await prisma.project.findUnique({
      where: { id: projectId.trim() },
      include: { team: { include: { members: true } } },
    });
    if (!project) throw new AppError('Project not found', 404);
    if (user && !this.canAccessProject(user, project)) throw new AppError('Access denied: insufficient permissions', 403);

    return prisma.sprint.findMany({
      where: { projectId: project.id },
      orderBy: { startDate: 'asc' },
    });
  }

  public static async getSprintById(sprintId: string, user?: { id: string; role: Role }) {
    if (!sprintId || !sprintId.trim()) throw new AppError('Sprint ID is required', 400);
    const sprint = await prisma.sprint.findUnique({
      where: { id: sprintId.trim() },
      include: { project: { include: { team: { include: { members: true } } } }, userStories: true },
    });
    if (!sprint) throw new AppError('Sprint not found', 404);
    if (user && !this.canAccessProject(user, sprint.project)) throw new AppError('Access denied: insufficient permissions', 403);

    return sprint;
  }

  public static async updateSprint(sprintId: string, data: UpdateSprintDTO, user: { id: string; role: Role }) {
    if (!sprintId || !sprintId.trim()) throw new AppError('Sprint ID is required', 400);
    const sprint = await prisma.sprint.findUnique({
      where: { id: sprintId.trim() },
      include: { project: { include: { team: { include: { members: true } } } } },
    });
    if (!sprint) throw new AppError('Sprint not found', 404);
    if (!this.canAccessProject(user, sprint.project)) throw new AppError('Access denied: insufficient permissions', 403);

    const updateData: any = {};
    if (data.name !== undefined) {
      if (!data.name.trim()) throw new AppError('Sprint name cannot be empty', 400);
      updateData.name = data.name.trim();
    }
    
    if (data.startDate !== undefined || data.endDate !== undefined) {
      const sDate = data.startDate ? new Date(data.startDate) : sprint.startDate;
      const eDate = data.endDate ? new Date(data.endDate) : sprint.endDate;
      if (isNaN(sDate.getTime()) || isNaN(eDate.getTime())) {
        throw new AppError('Invalid start or end date', 400);
      }
      if (sDate > eDate) {
        throw new AppError('Start date must be before end date', 400);
      }
      if (data.startDate !== undefined) updateData.startDate = sDate;
      if (data.endDate !== undefined) updateData.endDate = eDate;
    }

    if (data.status !== undefined) {
      if (!Object.values(SprintStatus).includes(data.status)) {
        throw new AppError(`Invalid status. Allowed: ${Object.values(SprintStatus).join(', ')}`, 400);
      }
      updateData.status = data.status;
    }

    if (Object.keys(updateData).length === 0) throw new AppError('At least one field must be provided to update', 400);

    return prisma.sprint.update({
      where: { id: sprint.id },
      data: updateData,
    });
  }

  public static async deleteSprint(sprintId: string, user: { id: string; role: Role }) {
    if (!sprintId || !sprintId.trim()) throw new AppError('Sprint ID is required', 400);
    const sprint = await prisma.sprint.findUnique({
      where: { id: sprintId.trim() },
      include: { project: { include: { team: { include: { members: true } } } } },
    });
    if (!sprint) throw new AppError('Sprint not found', 404);
    if (!this.canAccessProject(user, sprint.project)) throw new AppError('Access denied: insufficient permissions', 403);

    await prisma.sprint.delete({ where: { id: sprint.id } });
    return { message: 'Sprint deleted successfully' };
  }

  public static async assignStoriesToSprint(sprintId: string, storyIds: string[], user: { id: string; role: Role }) {
    if (!sprintId || !sprintId.trim()) throw new AppError('Sprint ID is required', 400);
    if (!Array.isArray(storyIds) || storyIds.length === 0) {
      throw new AppError('An array of story IDs is required', 400);
    }

    const sprint = await prisma.sprint.findUnique({
      where: { id: sprintId.trim() },
      include: { project: { include: { team: { include: { members: true } } } } },
    });
    if (!sprint) throw new AppError('Sprint not found', 404);
    if (!this.canAccessProject(user, sprint.project)) throw new AppError('Access denied: insufficient permissions', 403);

    // Verify all stories exist and belong to the same project as the sprint
    const stories = await prisma.userStory.findMany({
      where: { id: { in: storyIds } },
    });

    if (stories.length !== storyIds.length) {
      throw new AppError('One or more user stories not found', 404);
    }

    const mismatchedProject = stories.some((story: any) => story.projectId !== sprint.projectId);
    if (mismatchedProject) {
      throw new AppError('All user stories must belong to the same project as the sprint', 400);
    }

    // Assign sprintId
    await prisma.userStory.updateMany({
      where: { id: { in: storyIds } },
      data: { sprintId: sprint.id },
    });

    return { message: 'Stories successfully assigned to sprint' };
  }

  public static async getSprintBoard(sprintId: string, user?: { id: string; role: Role }) {
    if (!sprintId || !sprintId.trim()) throw new AppError('Sprint ID is required', 400);
    const sprint = await prisma.sprint.findUnique({
      where: { id: sprintId.trim() },
      include: { project: { include: { team: { include: { members: true } } } } },
    });
    if (!sprint) throw new AppError('Sprint not found', 404);
    if (user && !this.canAccessProject(user, sprint.project)) throw new AppError('Access denied: insufficient permissions', 403);

    const tasks = await prisma.task.findMany({
      where: { userStory: { sprintId: sprint.id } },
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
