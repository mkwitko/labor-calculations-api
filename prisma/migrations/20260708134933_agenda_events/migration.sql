-- CreateEnum
CREATE TYPE "AgendaEventSource" AS ENUM ('manual', 'google');

-- AlterTable
ALTER TABLE "MonetaryIndex" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "AgendaEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "remindEmail" BOOLEAN NOT NULL DEFAULT true,
    "source" "AgendaEventSource" NOT NULL DEFAULT 'manual',
    "googleEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgendaEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgendaEvent_userId_idx" ON "AgendaEvent"("userId");

-- CreateIndex
CREATE INDEX "AgendaEvent_startsAt_idx" ON "AgendaEvent"("startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgendaEvent_userId_googleEventId_key" ON "AgendaEvent"("userId", "googleEventId");

-- AddForeignKey
ALTER TABLE "AgendaEvent" ADD CONSTRAINT "AgendaEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
