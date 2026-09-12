import { Role, TaskStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

export interface CreateTaskDTO {
  title: string;
  description?: string;
  status?: TaskStatus;
  assigneeId?: string;
}

export interface UpdateTaskDTO {
  title?: string;
  description?: string;
  status?: TaskStatus;
  assigneeId?: string | null;
}

const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  TODO: [TaskStatus.IN_PROGRESS],
  IN_PROGRESS: [TaskStatus.TODO, TaskStatus.IN_REVIEW, TaskStatus.DONE],
  IN_REVIEW: [TaskStatus.IN_PROGRESS, TaskStatus.DONE],
  DONE: [TaskStatus.IN_PROGRESS, TaskStatus.IN_REVIEW],
};

export class TaskService {
  private static canAccessProject(
    user: { id: string; role: Role },
    project: {
      facultyId: string | null;
      team: { leadId: string | null; members: { userId: string }[] } | null;
    }
  ): boolean {
    if (user.role === Role.FACULTY || project.facultyId === user.id) return true;
    if (!project.team) return false;
    return (
      project.team.leadId === user.id ||
      project.team.members.some((m) => m.userId === user.id)
    );
  }

  public static async createTask(storyId: string, data: CreateTaskDTO, user: { id: string; role: Role }) {
    if (!storyId || !storyId.trim()) throw new AppError('User Story ID is required', 400);
    const story = await prisma.userStory.findUnique({
      where: { id: storyId.trim() },
      include: { project: { include: { team: { include: { members: true } } } } },
    });
    if (!story) throw new AppError('User Story not found', 404);
    if (!this.canAccessProject(user, story.project)) throw new AppError('Access denied', 403);

    const { title, description, status, assigneeId } = data;
    if (!title || !title.trim()) throw new AppError('Task title is required', 400);

    let taskStatus = TaskStatus.TODO;
    if (status !== undefined) {
      if (!Object.values(TaskStatus).includes(status)) {
        throw new AppError('Invalid task status', 400);
      }
      taskStatus = status;
    }

    if (assigneeId) {
      const isTeamMember =
        story.project.team?.leadId === assigneeId ||
        story.project.team?.members.some((m) => m.userId === assigneeId);

      if (!isTeamMember) {
        throw new AppError('Assignee must be a member of the project team', 400);
      }

      const userExists = await prisma.user.findUnique({ where: { id: assigneeId } });
      if (!userExists) throw new AppError('Assignee not found', 404);
    }

    return prisma.task.create({
      data: {
        title: title.trim(),
        description: description?.trim(),
        status: taskStatus,
        userStoryId: story.id,
        assigneeId: assigneeId || null,
      },
    });
  }

  public static async getTasksByUserStory(storyId: string, user?: { id: string; role: Role }) {
    if (!storyId || !storyId.trim()) throw new AppError('User Story ID is required', 400);
    const story = await prisma.userStory.findUnique({
      where: { id: storyId.trim() },
      include: { project: { include: { team: { include: { members: true } } } } },
    });
    if (!story) throw new AppError('User Story not found', 404);
    if (user && !this.canAccessProject(user, story.project)) throw new AppError('Access denied', 403);

    return prisma.task.findMany({
      where: { userStoryId: story.id },
      orderBy: { createdAt: 'asc' },
    });
  }

  public static async getTaskById(taskId: string, user?: { id: string; role: Role }) {
    if (!taskId || !taskId.trim()) throw new AppError('Task ID is required', 400);
    const task = await prisma.task.findUnique({
      where: { id: taskId.trim() },
      include: { userStory: { include: { project: { include: { team: { include: { members: true } } } } } } },
    });
    if (!task) throw new AppError('Task not found', 404);
    if (user && !this.canAccessProject(user, task.userStory.project)) throw new AppError('Access denied', 403);

    return task;
  }

  public static async updateTask(taskId: string, data: UpdateTaskDTO, user: { id: string; role: Role }) {
    if (!taskId || !taskId.trim()) throw new AppError('Task ID is required', 400);
    const task = await prisma.task.findUnique({
      where: { id: taskId.trim() },
      include: { userStory: { include: { project: { include: { team: { include: { members: true } } } } } } },
    });
    if (!task) throw new AppError('Task not found', 404);
    if (!this.canAccessProject(user, task.userStory.project)) throw new AppError('Access denied', 403);

    const updateData: any = {};
    if (data.title !== undefined) {
      if (!data.title.trim()) throw new AppError('Task title cannot be empty', 400);
      updateData.title = data.title.trim();
    }
    if (data.description !== undefined) {
      updateData.description = data.description?.trim();
    }
    if (data.status !== undefined && data.status !== task.status) {
      if (!Object.values(TaskStatus).includes(data.status)) {
        throw new AppError('Invalid task status', 400);
      }
      
      const allowedNextStates = ALLOWED_TRANSITIONS[task.status];
      if (!allowedNextStates.includes(data.status)) {
        throw new AppError(`Invalid status transition from ${task.status} to ${data.status}`, 400);
      }

      updateData.status = data.status;
    }
    if (data.assigneeId !== undefined) {
      if (data.assigneeId) {
        const isTeamMember =
          task.userStory.project.team?.leadId === data.assigneeId ||
          task.userStory.project.team?.members.some((m) => m.userId === data.assigneeId);

        if (!isTeamMember) {
          throw new AppError('Assignee must be a member of the project team', 400);
        }

        const userExists = await prisma.user.findUnique({ where: { id: data.assigneeId } });
        if (!userExists) throw new AppError('Assignee not found', 404);
      }
      updateData.assigneeId = data.assigneeId;
    }

    if (Object.keys(updateData).length === 0) throw new AppError('At least one field must be provided to update', 400);

    return prisma.task.update({
      where: { id: task.id },
      data: updateData,
    });
  }

  public static async deleteTask(taskId: string, user: { id: string; role: Role }) {
    if (!taskId || !taskId.trim()) throw new AppError('Task ID is required', 400);
    const task = await prisma.task.findUnique({
      where: { id: taskId.trim() },
      include: { userStory: { include: { project: { include: { team: { include: { members: true } } } } } } },
    });
    if (!task) throw new AppError('Task not found', 404);
    if (!this.canAccessProject(user, task.userStory.project)) throw new AppError('Access denied', 403);

    await prisma.task.delete({ where: { id: task.id } });
    return { message: 'Task deleted successfully' };
  }
}
