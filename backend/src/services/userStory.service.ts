import { Role, UserStoryStatus, UserStoryPriority } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

export interface CreateUserStoryDTO {
  title: string;
  description?: string | null;
  status?: UserStoryStatus;
  priority?: UserStoryPriority;
  storyPoints?: number | null;
  order?: number;
  sprintId?: string | null;
}

export interface UpdateUserStoryDTO {
  title?: string;
  description?: string | null;
  status?: UserStoryStatus;
  priority?: UserStoryPriority;
  storyPoints?: number | null;
  order?: number;
  sprintId?: string | null;
}

export interface UserStoryQueryDTO {
  status?: UserStoryStatus;
  priority?: UserStoryPriority;
}

export class UserStoryService {
  /**
   * Helper to verify if a user has access to a project and its user stories.
   * Access is granted to FACULTY users, the assigned faculty advisor, and members/lead of the project team.
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
   * Create a user story for a project.
   */
  public static async createUserStory(
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

    const { title, description, status, priority, storyPoints, order, sprintId } = data;

    if (!title || typeof title !== 'string' || !title.trim()) {
      throw new AppError('User story title is required', 400);
    }

    let storyStatus: UserStoryStatus = UserStoryStatus.TODO;
    if (status !== undefined) {
      if (!Object.values(UserStoryStatus).includes(status)) {
        throw new AppError(
          `Invalid user story status. Allowed: ${Object.values(UserStoryStatus).join(', ')}`,
          400
        );
      }
      storyStatus = status;
    }

    let storyOrder = 0;
    if (order !== undefined) {
      if (typeof order !== 'number' || isNaN(order)) {
        throw new AppError('Invalid order number', 400);
      }
      storyOrder = order;
    }

    let storyPriority: UserStoryPriority = UserStoryPriority.MEDIUM;
    if (priority !== undefined) {
      if (!Object.values(UserStoryPriority).includes(priority)) {
        throw new AppError(
          `Invalid user story priority. Allowed: ${Object.values(UserStoryPriority).join(', ')}`,
          400
        );
      }
      storyPriority = priority;
    }

    let storyStoryPoints: number | null = null;
    if (storyPoints !== undefined) {
      if (storyPoints !== null && (typeof storyPoints !== 'number' || isNaN(storyPoints) || storyPoints < 0)) {
        throw new AppError('Invalid story points', 400);
      }
      storyStoryPoints = storyPoints;
    }

    return prisma.userStory.create({
      data: {
        title: title.trim(),
        description: description ? description.trim() : null,
        status: storyStatus,
        priority: storyPriority,
        storyPoints: storyStoryPoints,
        order: storyOrder,
        projectId: project.id,
        sprintId: sprintId || null,
      },
    });
  }

  /**
   * Get all user stories for a project with optional status filtering.
   */
  public static async getUserStoriesByProjectId(
    projectId: string,
    query?: UserStoryQueryDTO,
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

    return prisma.userStory.findMany({
      where,
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Get a user story by ID.
   */
  public static async getUserStoryById(
    storyId: string,
    user?: { id: string; role: Role }
  ) {
    if (!storyId || typeof storyId !== 'string' || !storyId.trim()) {
      throw new AppError('User story ID is required', 400);
    }

    const story = await prisma.userStory.findUnique({
      where: { id: storyId.trim() },
      include: {
        project: {
          include: {
            team: {
              include: {
                members: true,
              },
            },
          },
        },
      },
    });

    if (!story) {
      throw new AppError('User story not found', 404);
    }

    if (user && !this.canAccessProject(user, story.project)) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    return story;
  }

  /**
   * Update a user story by ID.
   */
  public static async updateUserStory(
    storyId: string,
    data: UpdateUserStoryDTO,
    user: { id: string; role: Role }
  ) {
    if (!storyId || typeof storyId !== 'string' || !storyId.trim()) {
      throw new AppError('User story ID is required', 400);
    }

    const story = await prisma.userStory.findUnique({
      where: { id: storyId.trim() },
      include: {
        project: {
          include: {
            team: {
              include: {
                members: true,
              },
            },
          },
        },
      },
    });

    if (!story) {
      throw new AppError('User story not found', 404);
    }

    if (!this.canAccessProject(user, story.project)) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    const updateData: {
      title?: string;
      description?: string | null;
      status?: UserStoryStatus;
      priority?: UserStoryPriority;
      storyPoints?: number | null;
      order?: number;
      sprintId?: string | null;
    } = {};

    if (data.title !== undefined) {
      if (typeof data.title !== 'string' || !data.title.trim()) {
        throw new AppError('User story title cannot be empty', 400);
      }
      updateData.title = data.title.trim();
    }

    if (data.description !== undefined) {
      updateData.description = data.description ? data.description.trim() : null;
    }

    if (data.status !== undefined) {
      if (!Object.values(UserStoryStatus).includes(data.status)) {
        throw new AppError(
          `Invalid user story status. Allowed: ${Object.values(UserStoryStatus).join(', ')}`,
          400
        );
      }
      updateData.status = data.status;
    }

    if (data.priority !== undefined) {
      if (!Object.values(UserStoryPriority).includes(data.priority)) {
        throw new AppError(
          `Invalid user story priority. Allowed: ${Object.values(UserStoryPriority).join(', ')}`,
          400
        );
      }
      updateData.priority = data.priority;
    }

    if (data.storyPoints !== undefined) {
      if (data.storyPoints !== null && (typeof data.storyPoints !== 'number' || isNaN(data.storyPoints) || data.storyPoints < 0)) {
        throw new AppError('Invalid story points', 400);
      }
      updateData.storyPoints = data.storyPoints;
    }

    if (data.order !== undefined) {
      if (typeof data.order !== 'number' || isNaN(data.order)) {
        throw new AppError('Invalid order number', 400);
      }
      updateData.order = data.order;
    }

    if (data.sprintId !== undefined) {
      updateData.sprintId = data.sprintId;
    }

    if (Object.keys(updateData).length === 0) {
      throw new AppError('At least one field must be provided to update', 400);
    }

    return prisma.userStory.update({
      where: { id: story.id },
      data: updateData,
    });
  }

  /**
   * Delete a user story by ID.
   */
  public static async deleteUserStory(
    storyId: string,
    user: { id: string; role: Role }
  ) {
    if (!storyId || typeof storyId !== 'string' || !storyId.trim()) {
      throw new AppError('User story ID is required', 400);
    }

    const story = await prisma.userStory.findUnique({
      where: { id: storyId.trim() },
      include: {
        project: {
          include: {
            team: {
              include: {
                members: true,
              },
            },
          },
        },
      },
    });

    if (!story) {
      throw new AppError('User story not found', 404);
    }

    if (!this.canAccessProject(user, story.project)) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    await prisma.userStory.delete({
      where: { id: story.id },
    });

    return { message: 'User story deleted successfully' };
  }
}
