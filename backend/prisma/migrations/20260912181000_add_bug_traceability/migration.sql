-- CreateEnum
CREATE TYPE "BugPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "BugSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "BugStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateTable
CREATE TABLE "bugs" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "BugPriority" NOT NULL DEFAULT 'MEDIUM',
    "severity" "BugSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "BugStatus" NOT NULL DEFAULT 'OPEN',
    "projectId" TEXT NOT NULL,
    "requirementId" TEXT,
    "userStoryId" TEXT,
    "taskId" TEXT,
    "sprintId" TEXT,
    "pullRequestUrl" TEXT,
    "prNumber" INTEGER,
    "reporterId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bugs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bugs_projectId_idx" ON "bugs"("projectId");

-- CreateIndex
CREATE INDEX "bugs_status_idx" ON "bugs"("status");

-- CreateIndex
CREATE INDEX "bugs_requirementId_idx" ON "bugs"("requirementId");

-- CreateIndex
CREATE INDEX "bugs_userStoryId_idx" ON "bugs"("userStoryId");

-- CreateIndex
CREATE INDEX "bugs_taskId_idx" ON "bugs"("taskId");

-- CreateIndex
CREATE INDEX "bugs_sprintId_idx" ON "bugs"("sprintId");

-- AddForeignKey
ALTER TABLE "bugs" ADD CONSTRAINT "bugs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bugs" ADD CONSTRAINT "bugs_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "requirements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bugs" ADD CONSTRAINT "bugs_userStoryId_fkey" FOREIGN KEY ("userStoryId") REFERENCES "user_stories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bugs" ADD CONSTRAINT "bugs_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bugs" ADD CONSTRAINT "bugs_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "sprints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bugs" ADD CONSTRAINT "bugs_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bugs" ADD CONSTRAINT "bugs_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
