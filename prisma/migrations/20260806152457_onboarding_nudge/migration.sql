-- AlterTable
ALTER TABLE "User" ADD COLUMN     "onbNudgeD1SentAt" TIMESTAMP(3),
ADD COLUMN     "onbNudgeD3SentAt" TIMESTAMP(3),
ADD COLUMN     "onbNudgeOptOut" BOOLEAN NOT NULL DEFAULT false;
