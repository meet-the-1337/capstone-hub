import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

export interface ConnectGitHubRepoDTO {
  repoOwner: string;
  repoName: string;
  repoUrl?: string;
  accessToken?: string;
  defaultBranch?: string;
}

export class GitHubService {
  /**
   * Helper to verify if user can manage GitHub settings for a project (FACULTY or TEAM_LEAD).
   */
  private static canManageProjectGitHub(
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
      project.team.members.some(
        (m) => m.userId === user.id && m.role === Role.TEAM_LEAD
      )
    );
  }

  /**
   * Helper to verify if user can view GitHub data for a project (FACULTY or any team member).
   */
  private static canViewProjectGitHub(
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
   * Connect a project to a GitHub repository.
   */
  public static async connectRepository(
    projectId: string,
    data: ConnectGitHubRepoDTO,
    user: { id: string; role: Role }
  ) {
    if (!projectId || typeof projectId !== 'string' || !projectId.trim()) {
      throw new AppError('Project ID is required', 400);
    }

    const { repoOwner, repoName, repoUrl, accessToken, defaultBranch } = data;

    if (!repoOwner || typeof repoOwner !== 'string' || !repoOwner.trim()) {
      throw new AppError('GitHub repository owner is required', 400);
    }

    if (!repoName || typeof repoName !== 'string' || !repoName.trim()) {
      throw new AppError('GitHub repository name is required', 400);
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

    if (!this.canManageProjectGitHub(user, project)) {
      throw new AppError('Access denied: insufficient permissions to manage GitHub repository', 403);
    }

    const cleanOwner = repoOwner.trim();
    const cleanRepo = repoName.trim();
    const constructedUrl = repoUrl?.trim() || `https://github.com/${cleanOwner}/${cleanRepo}`;
    const cleanBranch = defaultBranch?.trim() || 'main';

    const connection = await prisma.gitHubConnection.upsert({
      where: { projectId: project.id },
      create: {
        projectId: project.id,
        repoOwner: cleanOwner,
        repoName: cleanRepo,
        repoUrl: constructedUrl,
        accessToken: accessToken?.trim() || null,
        defaultBranch: cleanBranch,
      },
      update: {
        repoOwner: cleanOwner,
        repoName: cleanRepo,
        repoUrl: constructedUrl,
        accessToken: accessToken !== undefined ? accessToken?.trim() || null : undefined,
        defaultBranch: cleanBranch,
      },
    });

    return {
      id: connection.id,
      projectId: connection.projectId,
      repoOwner: connection.repoOwner,
      repoName: connection.repoName,
      repoUrl: connection.repoUrl,
      defaultBranch: connection.defaultBranch,
      connectedAt: connection.createdAt,
      updatedAt: connection.updatedAt,
      hasAccessToken: Boolean(connection.accessToken),
    };
  }

  /**
   * Disconnect a project from its connected GitHub repository.
   */
  public static async disconnectRepository(
    projectId: string,
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
        githubConnection: true,
      },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    if (!this.canManageProjectGitHub(user, project)) {
      throw new AppError('Access denied: insufficient permissions to manage GitHub repository', 403);
    }

    if (!project.githubConnection) {
      throw new AppError('No GitHub repository is connected to this project', 404);
    }

    await prisma.gitHubConnection.delete({
      where: { projectId: project.id },
    });

    return { message: 'GitHub repository disconnected successfully' };
  }

  /**
   * Retrieve the active GitHub repository connection for a project.
   */
  public static async getConnection(
    projectId: string,
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
        githubConnection: true,
      },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    if (!this.canViewProjectGitHub(user, project)) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    if (!project.githubConnection) {
      throw new AppError('No GitHub repository connected for this project', 404);
    }

    return {
      id: project.githubConnection.id,
      projectId: project.githubConnection.projectId,
      repoOwner: project.githubConnection.repoOwner,
      repoName: project.githubConnection.repoName,
      repoUrl: project.githubConnection.repoUrl,
      defaultBranch: project.githubConnection.defaultBranch,
      connectedAt: project.githubConnection.createdAt,
      updatedAt: project.githubConnection.updatedAt,
      hasAccessToken: Boolean(project.githubConnection.accessToken),
    };
  }
}
