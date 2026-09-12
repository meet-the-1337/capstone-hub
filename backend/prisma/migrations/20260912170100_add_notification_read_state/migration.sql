-- AlterTable
ALTER TABLE "notifications" ADD COLUMN "readAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "notifications_userId_read_idx" ON "notifications"("userId", "read");
