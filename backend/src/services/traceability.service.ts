import { prisma } from '../lib/prisma';
import { Role } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';

export class TraceabilityService {
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

  /**
   * Complete project-wide hierarchical traceability graph with coverage stats.
   */
  public static async getProjectTraceability(projectId: string, user: { id: string; role: Role }) {
    if (!projectId || !projectId.trim()) throw new AppError('Project ID is required', 400);

    const project = await prisma.project.findUnique({
      where: { id: projectId.trim() },
      include: {
        team: { include: { members: true } },
        githubConnection: true,
      },
    });

    if (!project) throw new AppError('Project not found', 404);
    if (!this.canAccessProject(user, project)) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    const [requirements, userStories, tasks, sprints, bugs] = await Promise.all([
      prisma.requirement.findMany({
        where: { projectId: project.id },
        include: {
          userStories: {
            include: {
              userStory: {
                include: {
                  sprint: true,
                  tasks: {
                    include: {
                      assignee: { select: { id: true, name: true, email: true, role: true } },
                      sprint: true,
                    },
                  },
                },
              },
            },
          },
          bugs: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.userStory.findMany({
        where: { projectId: project.id },
        include: {
          requirements: { include: { requirement: true } },
          sprint: true,
          tasks: {
            include: {
              assignee: { select: { id: true, name: true, email: true, role: true } },
              sprint: true,
              bugs: true,
            },
          },
          bugs: true,
        },
        orderBy: { order: 'asc' },
      }),
      prisma.task.findMany({
        where: {
          userStory: { projectId: project.id },
        },
        include: {
          userStory: true,
          sprint: true,
          assignee: { select: { id: true, name: true, email: true, role: true } },
          bugs: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.sprint.findMany({
        where: { projectId: project.id },
        include: {
          userStories: true,
          tasks: true,
          bugs: true,
        },
        orderBy: { startDate: 'asc' },
      }),
      prisma.bug.findMany({
        where: { projectId: project.id },
        include: {
          requirement: { select: { id: true, title: true } },
          userStory: { select: { id: true, title: true } },
          task: { select: { id: true, title: true } },
          sprint: { select: { id: true, name: true } },
          reporter: { select: { id: true, name: true, email: true } },
          assignee: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Build hierarchical tree
    const tree = requirements.map((req) => {
      const linkedStories = req.userStories.map((ru) => {
        const story = ru.userStory;
        const storyTasks = tasks.filter((t) => t.userStoryId === story.id);
        const storyBugs = bugs.filter((b) => b.userStoryId === story.id);
        return {
          id: story.id,
          title: story.title,
          description: story.description,
          status: story.status,
          priority: story.priority,
          storyPoints: story.storyPoints,
          sprint: story.sprint,
          tasks: storyTasks.map((t) => ({
            id: t.id,
            title: t.title,
            description: t.description,
            status: t.status,
            assignee: t.assignee,
            sprint: t.sprint || story.sprint,
            bugs: bugs.filter((b) => b.taskId === t.id),
          })),
          bugs: storyBugs,
        };
      });

      const directReqBugs = bugs.filter((b) => b.requirementId === req.id);

      return {
        id: req.id,
        title: req.title,
        description: req.description,
        type: req.type,
        priority: req.priority,
        status: req.status,
        version: req.version,
        stories: linkedStories,
        bugs: directReqBugs,
      };
    });

    // Unlinked items (for gap analysis)
    const linkedStoryIds = new Set(requirements.flatMap((r) => r.userStories.map((u) => u.userStoryId)));
    const unlinkedStories = userStories.filter((s) => !linkedStoryIds.has(s.id));
    const unlinkedBugs = bugs.filter((b) => !b.requirementId && !b.userStoryId && !b.taskId);

    // Compute coverage metrics
    const totalRequirements = requirements.length;
    const coveredRequirements = requirements.filter((r) => r.userStories.length > 0).length;
    const requirementCoverageRate = totalRequirements > 0
      ? Math.round((coveredRequirements / totalRequirements) * 100)
      : 100;

    const totalStories = userStories.length;
    const storiesWithTasks = userStories.filter((s) => s.tasks.length > 0).length;
    const storiesInSprints = userStories.filter((s) => !!s.sprintId).length;

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === 'DONE').length;

    const totalBugs = bugs.length;
    const resolvedBugs = bugs.filter((b) => b.status === 'RESOLVED' || b.status === 'CLOSED').length;
    const linkedBugs = bugs.filter((b) => b.requirementId || b.userStoryId || b.taskId || b.sprintId).length;

    return {
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        githubConnection: project.githubConnection,
      },
      tree,
      unlinkedStories,
      unlinkedBugs,
      sprints,
      coverage: {
        totalRequirements,
        coveredRequirements,
        requirementCoverageRate,
        totalStories,
        storiesWithTasks,
        storiesInSprints,
        totalTasks,
        completedTasks,
        totalBugs,
        resolvedBugs,
        linkedBugs,
      },
    };
  }

  /**
   * Flattened tabular traceability matrix rows.
   */
  public static async getTraceabilityMatrix(projectId: string, user: { id: string; role: Role }) {
    if (!projectId || !projectId.trim()) throw new AppError('Project ID is required', 400);

    const project = await prisma.project.findUnique({
      where: { id: projectId.trim() },
      include: { team: { include: { members: true } } },
    });

    if (!project) throw new AppError('Project not found', 404);
    if (!this.canAccessProject(user, project)) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    const [requirements, stories, tasks, bugs] = await Promise.all([
      prisma.requirement.findMany({
        where: { projectId: project.id },
        include: {
          userStories: {
            include: {
              userStory: {
                include: {
                  sprint: true,
                  tasks: { include: { sprint: true } },
                },
              },
            },
          },
        },
      }),
      prisma.userStory.findMany({
        where: { projectId: project.id },
        include: { sprint: true, tasks: true },
      }),
      prisma.task.findMany({
        where: { userStory: { projectId: project.id } },
        include: { sprint: true, userStory: true },
      }),
      prisma.bug.findMany({
        where: { projectId: project.id },
      }),
    ]);

    const matrixRows: Array<{
      requirementId?: string | null;
      requirementTitle?: string | null;
      requirementStatus?: string | null;
      userStoryId?: string | null;
      userStoryTitle?: string | null;
      userStoryStatus?: string | null;
      taskId?: string | null;
      taskTitle?: string | null;
      taskStatus?: string | null;
      sprintId?: string | null;
      sprintName?: string | null;
      bugId?: string | null;
      bugTitle?: string | null;
      bugStatus?: string | null;
      pullRequestUrl?: string | null;
      prNumber?: number | null;
    }> = [];

    // Map through requirements
    for (const req of requirements) {
      const directBugs = bugs.filter((b) => b.requirementId === req.id && !b.userStoryId && !b.taskId);

      if (req.userStories.length === 0) {
        if (directBugs.length > 0) {
          for (const bug of directBugs) {
            matrixRows.push({
              requirementId: req.id,
              requirementTitle: req.title,
              requirementStatus: req.status,
              userStoryId: null,
              userStoryTitle: null,
              userStoryStatus: null,
              taskId: null,
              taskTitle: null,
              taskStatus: null,
              sprintId: null,
              sprintName: null,
              bugId: bug.id,
              bugTitle: bug.title,
              bugStatus: bug.status,
              pullRequestUrl: bug.pullRequestUrl,
              prNumber: bug.prNumber,
            });
          }
        } else {
          matrixRows.push({
            requirementId: req.id,
            requirementTitle: req.title,
            requirementStatus: req.status,
            userStoryId: null,
            userStoryTitle: null,
            userStoryStatus: null,
            taskId: null,
            taskTitle: null,
            taskStatus: null,
            sprintId: null,
            sprintName: null,
            bugId: null,
            bugTitle: null,
            bugStatus: null,
            pullRequestUrl: null,
            prNumber: null,
          });
        }
      } else {
        for (const ru of req.userStories) {
          const story = ru.userStory;
          const storyTasks = story.tasks;
          const storyBugs = bugs.filter((b) => b.userStoryId === story.id && !b.taskId);

          if (storyTasks.length === 0) {
            if (storyBugs.length > 0) {
              for (const bug of storyBugs) {
                matrixRows.push({
                  requirementId: req.id,
                  requirementTitle: req.title,
                  requirementStatus: req.status,
                  userStoryId: story.id,
                  userStoryTitle: story.title,
                  userStoryStatus: story.status,
                  taskId: null,
                  taskTitle: null,
                  taskStatus: null,
                  sprintId: story.sprint?.id || null,
                  sprintName: story.sprint?.name || null,
                  bugId: bug.id,
                  bugTitle: bug.title,
                  bugStatus: bug.status,
                  pullRequestUrl: bug.pullRequestUrl,
                  prNumber: bug.prNumber,
                });
              }
            } else {
              matrixRows.push({
                requirementId: req.id,
                requirementTitle: req.title,
                requirementStatus: req.status,
                userStoryId: story.id,
                userStoryTitle: story.title,
                userStoryStatus: story.status,
                taskId: null,
                taskTitle: null,
                taskStatus: null,
                sprintId: story.sprint?.id || null,
                sprintName: story.sprint?.name || null,
                bugId: null,
                bugTitle: null,
                bugStatus: null,
                pullRequestUrl: null,
                prNumber: null,
              });
            }
          } else {
            for (const task of storyTasks) {
              const taskBugs = bugs.filter((b) => b.taskId === task.id);
              if (taskBugs.length > 0) {
                for (const bug of taskBugs) {
                  matrixRows.push({
                    requirementId: req.id,
                    requirementTitle: req.title,
                    requirementStatus: req.status,
                    userStoryId: story.id,
                    userStoryTitle: story.title,
                    userStoryStatus: story.status,
                    taskId: task.id,
                    taskTitle: task.title,
                    taskStatus: task.status,
                    sprintId: task.sprint?.id || story.sprint?.id || null,
                    sprintName: task.sprint?.name || story.sprint?.name || null,
                    bugId: bug.id,
                    bugTitle: bug.title,
                    bugStatus: bug.status,
                    pullRequestUrl: bug.pullRequestUrl,
                    prNumber: bug.prNumber,
                  });
                }
              } else {
                matrixRows.push({
                  requirementId: req.id,
                  requirementTitle: req.title,
                  requirementStatus: req.status,
                  userStoryId: story.id,
                  userStoryTitle: story.title,
                  userStoryStatus: story.status,
                  taskId: task.id,
                  taskTitle: task.title,
                  taskStatus: task.status,
                  sprintId: task.sprint?.id || story.sprint?.id || null,
                  sprintName: task.sprint?.name || story.sprint?.name || null,
                  bugId: null,
                  bugTitle: null,
                  bugStatus: null,
                  pullRequestUrl: null,
                  prNumber: null,
                });
              }
            }
          }
        }
      }
    }

    return {
      projectId: project.id,
      projectName: project.name,
      totalRows: matrixRows.length,
      rows: matrixRows,
    };
  }

  /**
   * Full traceability chain for a specific requirement.
   */
  public static async getRequirementTraceability(requirementId: string, user: { id: string; role: Role }) {
    if (!requirementId || !requirementId.trim()) throw new AppError('Requirement ID is required', 400);

    const requirement = await prisma.requirement.findUnique({
      where: { id: requirementId.trim() },
      include: {
        project: { include: { team: { include: { members: true } } } },
        userStories: {
          include: {
            userStory: {
              include: {
                sprint: true,
                tasks: {
                  include: {
                    assignee: { select: { id: true, name: true, email: true, role: true } },
                    sprint: true,
                    bugs: true,
                  },
                },
                bugs: true,
              },
            },
          },
        },
        bugs: true,
      },
    });

    if (!requirement) throw new AppError('Requirement not found', 404);
    if (!this.canAccessProject(user, requirement.project)) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    return requirement;
  }

  /**
   * Full traceability chain for a specific user story.
   */
  public static async getStoryTraceability(storyId: string, user: { id: string; role: Role }) {
    if (!storyId || !storyId.trim()) throw new AppError('User Story ID is required', 400);

    const story = await prisma.userStory.findUnique({
      where: { id: storyId.trim() },
      include: {
        project: { include: { team: { include: { members: true } } } },
        requirements: {
          include: {
            requirement: true,
          },
        },
        sprint: true,
        tasks: {
          include: {
            assignee: { select: { id: true, name: true, email: true, role: true } },
            sprint: true,
            bugs: true,
          },
        },
        bugs: true,
      },
    });

    if (!story) throw new AppError('User Story not found', 404);
    if (!this.canAccessProject(user, story.project)) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    return story;
  }

  /**
   * Full traceability chain for a specific task.
   */
  public static async getTaskTraceability(taskId: string, user: { id: string; role: Role }) {
    if (!taskId || !taskId.trim()) throw new AppError('Task ID is required', 400);

    const task = await prisma.task.findUnique({
      where: { id: taskId.trim() },
      include: {
        userStory: {
          include: {
            project: { include: { team: { include: { members: true } } } },
            requirements: { include: { requirement: true } },
            sprint: true,
          },
        },
        sprint: true,
        assignee: { select: { id: true, name: true, email: true, role: true } },
        bugs: true,
      },
    });

    if (!task) throw new AppError('Task not found', 404);
    if (!this.canAccessProject(user, task.userStory.project)) {
      throw new AppError('Access denied: insufficient permissions', 403);
    }

    return task;
  }
}
