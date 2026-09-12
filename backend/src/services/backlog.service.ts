import { Role, UserStoryStatus, UserStoryPriority } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { CreateUserStoryDTO, UserStoryService } from './userStory.service';

export interface ReorderBacklogItemDTO {
  id: string;
  order: number;
}

export interface ReorderBacklogDTO {
  storyIds?: string[];
  items?: ReorderBacklogItemDTO[];
}

export interface BacklogQueryDTO {
  status?: UserStoryStatus;
  priority?: UserStoryPriority;
}

export class BacklogService {
  /**
   * Helper to verify if a user has access to a project and its product backlog.
   */
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

  /**
   * Retrieve a project's product backlog and its user stories.
   */
  public static async getProjectBacklog(
    projectId: string,
    query?: BacklogQueryDTO,
    user?: { id: string; role: Role }
  ) {
    if (!projectId || typeof projectId !== 'string' || !projectId.trim()) {
      throw new AppError('Project ID is required', 400);
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId.trim() },
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

    if (user && !this.canAccessProject(user, project)) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    const where: {
      projectId: string;
      status?: UserStoryStatus;
      priority?: UserStoryPriority;
    } = {
      projectId: project.id,
    };

    if (query?.status) {
      if (!Object.values(UserStoryStatus).includes(query.status)) {
        throw new AppError(
          `Invalid user story status. Allowed: ${Object.values(UserStoryStatus).join(', ')}`,
          400
        );
      }
      where.status = query.status;
    }

    if (query?.priority) {
      if (!Object.values(UserStoryPriority).includes(query.priority)) {
        throw new AppError(
          `Invalid user story priority. Allowed: ${Object.values(UserStoryPriority).join(', ')}`,
          400
        );
      }
      where.priority = query.priority;
    }

    const stories = await prisma.userStory.findMany({
      where,
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });

    return {
      projectId: project.id,
      projectName: project.name,
      totalStories: stories.length,
      stories,
    };
  }

  /**
   * Add a new user story to the project's product backlog.
   */
  public static async addStoryToBacklog(
    projectId: string,
    data: CreateUserStoryDTO,
    user: { id: string; role: Role }
  ) {
    if (!projectId || typeof projectId !== 'string' || !projectId.trim()) {
      throw new AppError('Project ID is required', 400);
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId.trim() },
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

    if (!this.canAccessProject(user, project)) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    if (data.order === undefined) {
      const highestOrderStory = await prisma.userStory.findFirst({
        where: { projectId: project.id },
        orderBy: { order: 'desc' },
        select: { order: true },
      });
      data.order = highestOrderStory ? highestOrderStory.order + 1 : 0;
    }

    return UserStoryService.createUserStory(project.id, data, user);
  }

  /**
   * Reorder user stories within the project's product backlog.
   */
  public static async reorderBacklog(
    projectId: string,
    data: ReorderBacklogDTO,
    user: { id: string; role: Role }
  ) {
    if (!projectId || typeof projectId !== 'string' || !projectId.trim()) {
      throw new AppError('Project ID is required', 400);
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId.trim() },
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

    if (!this.canAccessProject(user, project)) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    const { storyIds, items } = data;

    if (!storyIds && !items) {
      throw new AppError('Either storyIds array or items array is required to reorder backlog', 400);
    }

    const reorderList: { id: string; order: number }[] = [];

    if (storyIds) {
      if (!Array.isArray(storyIds) || storyIds.length === 0) {
        throw new AppError('storyIds must be a non-empty array of story IDs', 400);
      }
      storyIds.forEach((id, index) => {
        if (typeof id !== 'string' || !id.trim()) {
          throw new AppError('Invalid story ID in storyIds array', 400);
        }
        reorderList.push({ id: id.trim(), order: index });
      });
    } else if (items) {
      if (!Array.isArray(items) || items.length === 0) {
        throw new AppError('items must be a non-empty array of { id, order } objects', 400);
      }
      items.forEach((item) => {
        if (!item || typeof item.id !== 'string' || !item.id.trim() || typeof item.order !== 'number' || isNaN(item.order)) {
          throw new AppError('Each item in items must have valid id and order number', 400);
        }
        reorderList.push({ id: item.id.trim(), order: item.order });
      });
    }

    // Verify all stories belong to this project
    const existingStories = await prisma.userStory.findMany({
      where: {
        projectId: project.id,
        id: { in: reorderList.map((r) => r.id) },
      },
      select: { id: true },
    });

    if (existingStories.length !== reorderList.length) {
      throw new AppError('One or more user stories do not belong to this project or do not exist', 400);
    }

    // Update orders
    for (const update of reorderList) {
      await prisma.userStory.update({
        where: { id: update.id },
        data: { order: update.order },
      });
    }

    return prisma.userStory.findMany({
      where: { projectId: project.id },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
  }
}
