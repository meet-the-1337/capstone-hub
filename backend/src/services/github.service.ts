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

export interface GetCommitsQueryDTO {
  branch?: string;
  sha?: string;
  author?: string;
  since?: string;
  until?: string;
  path?: string;
  page?: number | string;
  per_page?: number | string;
  limit?: number | string;
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

  /**
   * Helper to perform authenticated/unauthenticated fetch to GitHub REST API.
   */
  public static async fetchFromGitHub<T>(
    endpoint: string,
    connection: { accessToken?: string | null }
  ): Promise<T> {
    const url = endpoint.startsWith('http')
      ? endpoint
      : `https://api.github.com${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const token = connection.accessToken || process.env.GITHUB_TOKEN;

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'CapstoneHub-App',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, { headers });

      if (!response.ok) {
        if (response.status === 404) {
          throw new AppError('GitHub repository or resource not found', 404);
        }
        if (response.status === 401 || response.status === 403) {
          const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
          if (rateLimitRemaining === '0') {
            throw new AppError('GitHub API rate limit exceeded. Please configure an access token or try again later.', 429);
          }
          throw new AppError('GitHub authentication or permission failed', response.status);
        }
        throw new AppError(`GitHub API error: ${response.statusText}`, response.status >= 500 ? 502 : response.status);
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(`Failed to communicate with GitHub: ${(error as Error).message}`, 502);
    }
  }

  /**
   * Retrieve repository metadata for a connected project.
   */
  public static async getRepoMetadata(
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
      throw new AppError('No GitHub repository is connected to this project', 404);
    }

    const { repoOwner, repoName } = project.githubConnection;
    const rawData = await this.fetchFromGitHub<any>(
      `/repos/${repoOwner}/${repoName}`,
      project.githubConnection
    );

    return {
      repoOwner,
      repoName,
      fullName: rawData.full_name || `${repoOwner}/${repoName}`,
      description: rawData.description || null,
      htmlUrl: rawData.html_url || `https://github.com/${repoOwner}/${repoName}`,
      defaultBranch: rawData.default_branch || project.githubConnection.defaultBranch || 'main',
      stars: rawData.stargazers_count ?? 0,
      forks: rawData.forks_count ?? 0,
      openIssues: rawData.open_issues_count ?? 0,
      watchers: rawData.watchers_count ?? rawData.subscribers_count ?? 0,
      language: rawData.language || null,
      topics: rawData.topics || [],
      isPrivate: rawData.private ?? false,
      visibility: rawData.visibility || (rawData.private ? 'private' : 'public'),
      size: rawData.size ?? 0,
      license: rawData.license ? rawData.license.name || rawData.license.spdx_id : null,
      archived: rawData.archived ?? false,
      disabled: rawData.disabled ?? false,
      createdAt: rawData.created_at,
      updatedAt: rawData.updated_at,
      pushedAt: rawData.pushed_at,
    };
  }

  /**
   * Retrieve commits for a connected project's repository.
   */
  public static async getRepoCommits(
    projectId: string,
    query: GetCommitsQueryDTO,
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
      throw new AppError('No GitHub repository is connected to this project', 404);
    }

    const { repoOwner, repoName, defaultBranch } = project.githubConnection;
    const branch = query.sha || query.branch || defaultBranch || 'main';
    const page = Math.max(1, Number(query.page) || 1);
    const perPage = Math.min(100, Math.max(1, Number(query.per_page || query.limit) || 30));

    const params = new URLSearchParams();
    if (branch) params.append('sha', branch);
    if (query.author) params.append('author', query.author);
    if (query.since) params.append('since', query.since);
    if (query.until) params.append('until', query.until);
    if (query.path) params.append('path', query.path);
    params.append('page', String(page));
    params.append('per_page', String(perPage));

    const rawCommits = await this.fetchFromGitHub<any[]>(
      `/repos/${repoOwner}/${repoName}/commits?${params.toString()}`,
      project.githubConnection
    );

    const commits = Array.isArray(rawCommits)
      ? rawCommits.map((item) => ({
          sha: item.sha,
          shortSha: item.sha ? item.sha.substring(0, 7) : '',
          message: item.commit?.message || '',
          htmlUrl: item.html_url || `https://github.com/${repoOwner}/${repoName}/commit/${item.sha}`,
          author: {
            name: item.commit?.author?.name || item.author?.login || 'Unknown',
            email: item.commit?.author?.email || null,
            date: item.commit?.author?.date || null,
            username: item.author?.login || null,
            avatarUrl: item.author?.avatar_url || null,
          },
          committer: {
            name: item.commit?.committer?.name || item.committer?.login || 'Unknown',
            email: item.commit?.committer?.email || null,
            date: item.commit?.committer?.date || null,
          },
          parents: Array.isArray(item.parents) ? item.parents.map((p: any) => p.sha) : [],
        }))
      : [];

    return {
      repoOwner,
      repoName,
      branch,
      page,
      perPage,
      totalCount: commits.length,
      commits,
    };
  }
}
