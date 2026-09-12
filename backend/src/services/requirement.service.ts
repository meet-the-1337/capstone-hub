import { RequirementPriority, RequirementStatus, RequirementType, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

export interface CreateRequirementDTO {
  title: string;
  description: string;
  type?: RequirementType;
  priority?: RequirementPriority;
  status?: RequirementStatus;
  reviewFeedback?: string;
}

export interface UpdateRequirementDTO {
  title?: string;
  description?: string;
  type?: RequirementType;
  priority?: RequirementPriority;
  status?: RequirementStatus;
  reviewFeedback?: string;
}

export interface RequirementQueryDTO {
  type?: RequirementType;
  priority?: RequirementPriority;
  status?: RequirementStatus;
}

export interface ReviewRequirementDTO {
  action?: 'APPROVE' | 'REJECT';
  status?: RequirementStatus;
  feedback?: string;
}

/**
 * Valid state transitions for requirement status workflow
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<RequirementStatus, RequirementStatus[]> = {
  [RequirementStatus.DRAFT]: [
    RequirementStatus.DRAFT,
    RequirementStatus.IN_REVIEW,
  ],
  [RequirementStatus.IN_REVIEW]: [
    RequirementStatus.IN_REVIEW,
    RequirementStatus.APPROVED,
    RequirementStatus.REJECTED,
    RequirementStatus.DRAFT,
  ],
  [RequirementStatus.APPROVED]: [
    RequirementStatus.APPROVED,
    RequirementStatus.COMPLETED,
    RequirementStatus.IN_REVIEW,
    RequirementStatus.DRAFT,
  ],
  [RequirementStatus.REJECTED]: [
    RequirementStatus.REJECTED,
    RequirementStatus.COMPLETED,
  ],
  [RequirementStatus.COMPLETED]: [
    RequirementStatus.COMPLETED,
    RequirementStatus.APPROVED,
    RequirementStatus.IN_REVIEW,
  ],
};

export class RequirementService {
  /**
   * Helper to verify if a user has access to a project and its requirements.
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
   * Helper to check if a user is FACULTY or the assigned faculty advisor of the project.
   */
  private static isFacultyUser(
    user: { id: string; role: Role },
    project: { facultyId: string | null }
  ): boolean {
    return user.role === Role.FACULTY || project.facultyId === user.id;
  }

  /**
   * Create a requirement for a project with initial version snapshot (v1).
   */
  public static async createRequirement(
    projectId: string,
    data: CreateRequirementDTO,
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

    const { title, description, type, priority, status, reviewFeedback } = data;

    if (!title || typeof title !== 'string' || !title.trim()) {
      throw new AppError('Requirement title is required', 400);
    }

    if (!description || typeof description !== 'string' || !description.trim()) {
      throw new AppError('Requirement description is required', 400);
    }

    let requirementType: RequirementType = RequirementType.FUNCTIONAL;
    if (type !== undefined) {
      if (!Object.values(RequirementType).includes(type)) {
        throw new AppError(
          `Invalid requirement type. Allowed: ${Object.values(RequirementType).join(', ')}`,
          400
        );
      }
      requirementType = type;
    }

    let requirementPriority: RequirementPriority = RequirementPriority.MEDIUM;
    if (priority !== undefined) {
      if (!Object.values(RequirementPriority).includes(priority)) {
        throw new AppError(
          `Invalid requirement priority. Allowed: ${Object.values(RequirementPriority).join(', ')}`,
          400
        );
      }
      requirementPriority = priority;
    }

    let requirementStatus: RequirementStatus = RequirementStatus.DRAFT;
    if (status !== undefined) {
      if (!Object.values(RequirementStatus).includes(status)) {
        throw new AppError(
          `Invalid requirement status. Allowed: ${Object.values(RequirementStatus).join(', ')}`,
          400
        );
      }
      if (
        (status === RequirementStatus.APPROVED || status === RequirementStatus.REJECTED) &&
        !this.isFacultyUser(user, project)
      ) {
        throw new AppError('Access denied: only faculty can create approved or rejected requirements', 403);
      }
      requirementStatus = status;
    }

    const feedbackText = reviewFeedback ? reviewFeedback.trim() : null;

    return prisma.requirement.create({
      data: {
        title: title.trim(),
        description: description.trim(),
        type: requirementType,
        priority: requirementPriority,
        status: requirementStatus,
        reviewFeedback: feedbackText,
        version: 1,
        projectId: project.id,
        versions: {
          create: {
            versionNumber: 1,
            title: title.trim(),
            description: description.trim(),
            type: requirementType,
            priority: requirementPriority,
            status: requirementStatus,
            reviewFeedback: feedbackText,
          },
        },
      },
      include: {
        versions: true,
      },
    });
  }

  /**
   * Get all requirements for a project with optional type, priority, and status filtering.
   */
  public static async getRequirementsByProjectId(
    projectId: string,
    query?: RequirementQueryDTO,
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
      type?: RequirementType;
      priority?: RequirementPriority;
      status?: RequirementStatus;
    } = {
      projectId: project.id,
    };

    if (query?.type) {
      if (!Object.values(RequirementType).includes(query.type)) {
        throw new AppError(
          `Invalid requirement type. Allowed: ${Object.values(RequirementType).join(', ')}`,
          400
        );
      }
      where.type = query.type;
    }

    if (query?.priority) {
      if (!Object.values(RequirementPriority).includes(query.priority)) {
        throw new AppError(
          `Invalid requirement priority. Allowed: ${Object.values(RequirementPriority).join(', ')}`,
          400
        );
      }
      where.priority = query.priority;
    }

    if (query?.status) {
      if (!Object.values(RequirementStatus).includes(query.status)) {
        throw new AppError(
          `Invalid requirement status. Allowed: ${Object.values(RequirementStatus).join(', ')}`,
          400
        );
      }
      where.status = query.status;
    }

    return prisma.requirement.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Get a requirement by ID.
   */
  public static async getRequirementById(
    requirementId: string,
    user?: { id: string; role: Role }
  ) {
    if (!requirementId || typeof requirementId !== 'string' || !requirementId.trim()) {
      throw new AppError('Requirement ID is required', 400);
    }

    const requirement = await prisma.requirement.findUnique({
      where: { id: requirementId.trim() },
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
        versions: {
          orderBy: { versionNumber: 'desc' },
        },
      },
    });

    if (!requirement) {
      throw new AppError('Requirement not found', 404);
    }

    if (user && !this.canAccessProject(user, requirement.project)) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    return requirement;
  }

  /**
   * Update a requirement by ID with automatic version increment and snapshot persistence.
   */
  public static async updateRequirement(
    requirementId: string,
    data: UpdateRequirementDTO,
    user: { id: string; role: Role }
  ) {
    if (!requirementId || typeof requirementId !== 'string' || !requirementId.trim()) {
      throw new AppError('Requirement ID is required', 400);
    }

    const requirement = await prisma.requirement.findUnique({
      where: { id: requirementId.trim() },
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

    if (!requirement) {
      throw new AppError('Requirement not found', 404);
    }

    if (!this.canAccessProject(user, requirement.project)) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    const updateData: {
      title?: string;
      description?: string;
      type?: RequirementType;
      priority?: RequirementPriority;
      status?: RequirementStatus;
      reviewFeedback?: string | null;
    } = {};

    if (data.title !== undefined) {
      if (typeof data.title !== 'string' || !data.title.trim()) {
        throw new AppError('Requirement title cannot be empty', 400);
      }
      updateData.title = data.title.trim();
    }

    if (data.description !== undefined) {
      if (typeof data.description !== 'string' || !data.description.trim()) {
        throw new AppError('Requirement description cannot be empty', 400);
      }
      updateData.description = data.description.trim();
    }

    if (data.type !== undefined) {
      if (!Object.values(RequirementType).includes(data.type)) {
        throw new AppError(
          `Invalid requirement type. Allowed: ${Object.values(RequirementType).join(', ')}`,
          400
        );
      }
      updateData.type = data.type;
    }

    if (data.priority !== undefined) {
      if (!Object.values(RequirementPriority).includes(data.priority)) {
        throw new AppError(
          `Invalid requirement priority. Allowed: ${Object.values(RequirementPriority).join(', ')}`,
          400
        );
      }
      updateData.priority = data.priority;
    }

    if (data.status !== undefined) {
      if (!Object.values(RequirementStatus).includes(data.status)) {
        throw new AppError(
          `Invalid requirement status. Allowed: ${Object.values(RequirementStatus).join(', ')}`,
          400
        );
      }

      // Enforce status workflow transitions
      const currentStatus = requirement.status;
      const newStatus = data.status;
      const allowedNext = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];

      if (!allowedNext.includes(newStatus)) {
        throw new AppError(
          `Invalid status transition from ${currentStatus} to ${newStatus}`,
          400
        );
      }

      // Enforce faculty-only permissions for approval and rejection
      if (
        (newStatus === RequirementStatus.APPROVED || newStatus === RequirementStatus.REJECTED) &&
        !this.isFacultyUser(user, requirement.project)
      ) {
        throw new AppError('Access denied: only faculty can approve or reject requirements', 403);
      }

      updateData.status = newStatus;
    }

    if (data.reviewFeedback !== undefined) {
      updateData.reviewFeedback = data.reviewFeedback ? data.reviewFeedback.trim() : null;
    }

    if (Object.keys(updateData).length === 0) {
      throw new AppError('At least one field must be provided to update', 400);
    }

    const nextVersionNumber = requirement.version + 1;
    const finalTitle = updateData.title ?? requirement.title;
    const finalDescription = updateData.description ?? requirement.description;
    const finalType = updateData.type ?? requirement.type;
    const finalPriority = updateData.priority ?? requirement.priority;
    const finalStatus = updateData.status ?? requirement.status;
    const finalReviewFeedback = updateData.reviewFeedback !== undefined ? updateData.reviewFeedback : requirement.reviewFeedback;

    return prisma.requirement.update({
      where: { id: requirement.id },
      data: {
        ...updateData,
        version: nextVersionNumber,
        versions: {
          create: {
            versionNumber: nextVersionNumber,
            title: finalTitle,
            description: finalDescription,
            type: finalType,
            priority: finalPriority,
            status: finalStatus,
            reviewFeedback: finalReviewFeedback,
          },
        },
      },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
        },
      },
    });
  }

  /**
   * Submit a requirement for faculty review.
   * Allowed for team members/leads and faculty associated with the project.
   * Transitions from DRAFT or REJECTED to IN_REVIEW.
   */
  public static async submitRequirement(
    requirementId: string,
    user: { id: string; role: Role }
  ) {
    if (!requirementId || typeof requirementId !== 'string' || !requirementId.trim()) {
      throw new AppError('Requirement ID is required', 400);
    }

    const requirement = await prisma.requirement.findUnique({
      where: { id: requirementId.trim() },
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

    if (!requirement) {
      throw new AppError('Requirement not found', 404);
    }

    if (!this.canAccessProject(user, requirement.project)) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    if (
      requirement.status !== RequirementStatus.DRAFT &&
      requirement.status !== RequirementStatus.REJECTED
    ) {
      throw new AppError(
        `Cannot submit requirement with status ${requirement.status}. Only DRAFT or REJECTED requirements can be submitted for review.`,
        400
      );
    }

    const nextVersionNumber = requirement.version + 1;
    const newStatus = RequirementStatus.IN_REVIEW;

    return prisma.requirement.update({
      where: { id: requirement.id },
      data: {
        status: newStatus,
        version: nextVersionNumber,
        versions: {
          create: {
            versionNumber: nextVersionNumber,
            title: requirement.title,
            description: requirement.description,
            type: requirement.type,
            priority: requirement.priority,
            status: newStatus,
            reviewFeedback: requirement.reviewFeedback,
          },
        },
      },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
        },
      },
    });
  }

  /**
   * Review a requirement (approve or reject with optional feedback).
   * Only accessible to FACULTY users or the assigned faculty advisor.
   */
  public static async reviewRequirement(
    requirementId: string,
    data: ReviewRequirementDTO,
    user: { id: string; role: Role }
  ) {
    if (!requirementId || typeof requirementId !== 'string' || !requirementId.trim()) {
      throw new AppError('Requirement ID is required', 400);
    }

    const requirement = await prisma.requirement.findUnique({
      where: { id: requirementId.trim() },
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

    if (!requirement) {
      throw new AppError('Requirement not found', 404);
    }

    if (!this.canAccessProject(user, requirement.project)) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    if (!this.isFacultyUser(user, requirement.project)) {
      throw new AppError('Access denied: only faculty can review requirements', 403);
    }

    let targetStatus: RequirementStatus;
    if (data.status) {
      if (
        data.status !== RequirementStatus.APPROVED &&
        data.status !== RequirementStatus.REJECTED
      ) {
        throw new AppError('Invalid review status. Allowed: APPROVED, REJECTED', 400);
      }
      targetStatus = data.status;
    } else if (data.action) {
      const normalizedAction = data.action.toUpperCase();
      if (normalizedAction === 'APPROVE') {
        targetStatus = RequirementStatus.APPROVED;
      } else if (normalizedAction === 'REJECT') {
        targetStatus = RequirementStatus.REJECTED;
      } else {
        throw new AppError('Invalid review action. Allowed: APPROVE, REJECT', 400);
      }
    } else {
      throw new AppError('Review action or status is required (APPROVE or REJECT)', 400);
    }

    const currentStatus = requirement.status;
    const allowedNext = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];

    if (!allowedNext.includes(targetStatus)) {
      throw new AppError(
        `Invalid status transition from ${currentStatus} to ${targetStatus}`,
        400
      );
    }

    const feedbackText = data.feedback !== undefined ? (data.feedback ? data.feedback.trim() : null) : requirement.reviewFeedback;
    const nextVersionNumber = requirement.version + 1;

    return prisma.requirement.update({
      where: { id: requirement.id },
      data: {
        status: targetStatus,
        reviewFeedback: feedbackText,
        version: nextVersionNumber,
        versions: {
          create: {
            versionNumber: nextVersionNumber,
            title: requirement.title,
            description: requirement.description,
            type: requirement.type,
            priority: requirement.priority,
            status: targetStatus,
            reviewFeedback: feedbackText,
          },
        },
      },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
        },
      },
    });
  }

  /**
   * Approve a requirement with optional feedback.
   */
  public static async approveRequirement(
    requirementId: string,
    feedback: string | undefined,
    user: { id: string; role: Role }
  ) {
    return this.reviewRequirement(requirementId, { action: 'APPROVE', feedback }, user);
  }

  /**
   * Reject a requirement with optional feedback.
   */
  public static async rejectRequirement(
    requirementId: string,
    feedback: string | undefined,
    user: { id: string; role: Role }
  ) {
    return this.reviewRequirement(requirementId, { action: 'REJECT', feedback }, user);
  }

  /**
   * Get all version snapshots of a requirement.
   */
  public static async getRequirementVersions(
    requirementId: string,
    user?: { id: string; role: Role }
  ) {
    if (!requirementId || typeof requirementId !== 'string' || !requirementId.trim()) {
      throw new AppError('Requirement ID is required', 400);
    }

    const requirement = await prisma.requirement.findUnique({
      where: { id: requirementId.trim() },
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

    if (!requirement) {
      throw new AppError('Requirement not found', 404);
    }

    if (user && !this.canAccessProject(user, requirement.project)) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    return prisma.requirementVersion.findMany({
      where: { requirementId: requirement.id },
      orderBy: { versionNumber: 'desc' },
    });
  }

  /**
   * Get a specific version snapshot of a requirement by version number.
   */
  public static async getRequirementVersionByNumber(
    requirementId: string,
    versionNumber: number,
    user?: { id: string; role: Role }
  ) {
    if (!requirementId || typeof requirementId !== 'string' || !requirementId.trim()) {
      throw new AppError('Requirement ID is required', 400);
    }

    if (isNaN(versionNumber) || versionNumber < 1) {
      throw new AppError('Invalid version number', 400);
    }

    const requirement = await prisma.requirement.findUnique({
      where: { id: requirementId.trim() },
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

    if (!requirement) {
      throw new AppError('Requirement not found', 404);
    }

    if (user && !this.canAccessProject(user, requirement.project)) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    const version = await prisma.requirementVersion.findUnique({
      where: {
        requirementId_versionNumber: {
          requirementId: requirement.id,
          versionNumber,
        },
      },
    });

    if (!version) {
      throw new AppError(`Requirement version ${versionNumber} not found`, 404);
    }

    return version;
  }

  /**
   * Delete a requirement by ID.
   */
  public static async deleteRequirement(
    requirementId: string,
    user: { id: string; role: Role }
  ) {
    if (!requirementId || typeof requirementId !== 'string' || !requirementId.trim()) {
      throw new AppError('Requirement ID is required', 400);
    }

    const requirement = await prisma.requirement.findUnique({
      where: { id: requirementId.trim() },
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

    if (!requirement) {
      throw new AppError('Requirement not found', 404);
    }

    if (!this.canAccessProject(user, requirement.project)) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    await prisma.requirement.delete({
      where: { id: requirement.id },
    });

    return { message: 'Requirement deleted successfully' };
  }

  /**
   * Link a user story to a requirement.
   */
  public static async linkUserStory(
    requirementId: string,
    userStoryId: string,
    user: { id: string; role: Role }
  ) {
    if (!requirementId || !requirementId.trim()) {
      throw new AppError('Requirement ID is required', 400);
    }
    if (!userStoryId || !userStoryId.trim()) {
      throw new AppError('User Story ID is required', 400);
    }

    const requirement = await prisma.requirement.findUnique({
      where: { id: requirementId.trim() },
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

    if (!requirement) {
      throw new AppError('Requirement not found', 404);
    }

    if (!this.canAccessProject(user, requirement.project)) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    const userStory = await prisma.userStory.findUnique({
      where: { id: userStoryId.trim() },
    });

    if (!userStory) {
      throw new AppError('User Story not found', 404);
    }

    // Both requirement and user story must belong to the same project
    if (userStory.projectId !== requirement.projectId) {
      throw new AppError('Cannot link requirement and user story from different projects', 400);
    }

    const link = await prisma.requirementUserStory.upsert({
      where: {
        requirementId_userStoryId: {
          requirementId: requirement.id,
          userStoryId: userStory.id,
        },
      },
      create: {
        requirementId: requirement.id,
        userStoryId: userStory.id,
      },
      update: {},
    });

    return {
      message: 'Requirement linked to User Story successfully',
      link,
      requirement: {
        id: requirement.id,
        title: requirement.title,
      },
      userStory: {
        id: userStory.id,
        title: userStory.title,
      },
    };
  }

  /**
   * Unlink a user story from a requirement.
   */
  public static async unlinkUserStory(
    requirementId: string,
    userStoryId: string,
    user: { id: string; role: Role }
  ) {
    if (!requirementId || !requirementId.trim()) {
      throw new AppError('Requirement ID is required', 400);
    }
    if (!userStoryId || !userStoryId.trim()) {
      throw new AppError('User Story ID is required', 400);
    }

    const requirement = await prisma.requirement.findUnique({
      where: { id: requirementId.trim() },
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

    if (!requirement) {
      throw new AppError('Requirement not found', 404);
    }

    if (!this.canAccessProject(user, requirement.project)) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    const existingLink = await prisma.requirementUserStory.findUnique({
      where: {
        requirementId_userStoryId: {
          requirementId: requirement.id,
          userStoryId: userStoryId.trim(),
        },
      },
    });

    if (!existingLink) {
      throw new AppError('Link between Requirement and User Story not found', 404);
    }

    await prisma.requirementUserStory.delete({
      where: {
        requirementId_userStoryId: {
          requirementId: requirement.id,
          userStoryId: userStoryId.trim(),
        },
      },
    });

    return { message: 'Requirement unlinked from User Story successfully' };
  }

  /**
   * Get all user stories linked to a requirement.
   */
  public static async getLinkedStories(
    requirementId: string,
    user: { id: string; role: Role }
  ) {
    if (!requirementId || !requirementId.trim()) {
      throw new AppError('Requirement ID is required', 400);
    }

    const requirement = await prisma.requirement.findUnique({
      where: { id: requirementId.trim() },
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

    if (!requirement) {
      throw new AppError('Requirement not found', 404);
    }

    if (!this.canAccessProject(user, requirement.project)) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    const links = await prisma.requirementUserStory.findMany({
      where: { requirementId: requirement.id },
      include: {
        userStory: {
          include: {
            tasks: true,
            sprint: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return links.map((l) => ({
      linkId: l.id,
      linkedAt: l.createdAt,
      userStory: l.userStory,
    }));
  }

  /**
   * Get all requirements linked to a user story.
   */
  public static async getLinkedRequirementsForStory(
    userStoryId: string,
    user: { id: string; role: Role }
  ) {
    if (!userStoryId || !userStoryId.trim()) {
      throw new AppError('User Story ID is required', 400);
    }

    const userStory = await prisma.userStory.findUnique({
      where: { id: userStoryId.trim() },
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

    if (!userStory) {
      throw new AppError('User Story not found', 404);
    }

    if (!this.canAccessProject(user, userStory.project)) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    const links = await prisma.requirementUserStory.findMany({
      where: { userStoryId: userStory.id },
      include: {
        requirement: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return links.map((l) => ({
      linkId: l.id,
      linkedAt: l.createdAt,
      requirement: l.requirement,
    }));
  }
}
