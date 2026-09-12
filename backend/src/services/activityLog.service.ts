import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { Role } from '@prisma/client';

export interface LogActivityDTO {
  action: string;
  entityType: string;
  entityId: string;
  details?: string;
  actorId: string;
  projectId?: string;
}

export class ActivityLogService {
  /**
   * Record an activity log entry. This is a fire-and-forget helper
   * designed to be called from other services after mutations.
   */
  public static async log(data: LogActivityDTO) {
    if (!data.action || !data.action.trim()) throw new AppError('Action is required', 400);
    if (!data.entityType || !data.entityType.trim()) throw new AppError('Entity type is required', 400);
    if (!data.entityId || !data.entityId.trim()) throw new AppError('Entity ID is required', 400);
    if (!data.actorId || !data.actorId.trim()) throw new AppError('Actor ID is required', 400);

    return prisma.activityLog.create({
      data: {
        action: data.action.trim(),
        entityType: data.entityType.trim(),
        entityId: data.entityId.trim(),
        details: data.details?.trim() || null,
        actorId: data.actorId.trim(),
        projectId: data.projectId?.trim() || null,
      },
    });
  }

  /**
   * Retrieve activity logs for a given project, with pagination.
   */
  public static async getByProject(
    projectId: string,
    user: { id: string; role: Role },
    pagination?: { page?: number; pageSize?: number }
  ) {
    if (!projectId || !projectId.trim()) throw new AppError('Project ID is required', 400);

    const project = await prisma.project.findUnique({
      where: { id: projectId.trim() },
      include: { team: { include: { members: true } } },
    });
    if (!project) throw new AppError('Project not found', 404);

    // Authorization
    const isFaculty = user.role === Role.FACULTY || project.facultyId === user.id;
    const isTeamMember =
      project.team &&
      (project.team.leadId === user.id ||
        project.team.members.some((m) => m.userId === user.id));
    if (!isFaculty && !isTeamMember) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    const page = pagination?.page && pagination.page > 0 ? pagination.page : 1;
    const pageSize = pagination?.pageSize && pagination.pageSize > 0 ? pagination.pageSize : 20;
    const skip = (page - 1) * pageSize;

    const [totalCount, logs] = await Promise.all([
      prisma.activityLog.count({ where: { projectId: project.id } }),
      prisma.activityLog.findMany({
        where: { projectId: project.id },
        include: {
          actor: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    return { totalCount, page, pageSize, logs };
  }
}
