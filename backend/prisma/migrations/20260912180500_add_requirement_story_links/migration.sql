-- CreateTable
CREATE TABLE "requirement_user_stories" (
    "id" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "userStoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requirement_user_stories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "requirement_user_stories_requirementId_userStoryId_key" ON "requirement_user_stories"("requirementId", "userStoryId");

-- AddForeignKey
ALTER TABLE "requirement_user_stories" ADD CONSTRAINT "requirement_user_stories_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_user_stories" ADD CONSTRAINT "requirement_user_stories_userStoryId_fkey" FOREIGN KEY ("userStoryId") REFERENCES "user_stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
