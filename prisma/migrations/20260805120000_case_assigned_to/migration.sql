-- Case.userId passa a significar "responsável", não "dono": dentro de uma
-- organização o caso pertence à organização, e a pessoa no campo é quem
-- responde por ele.
ALTER TABLE "Case" RENAME COLUMN "userId" TO "assignedToId";

ALTER INDEX "Case_userId_idx" RENAME TO "Case_assignedToId_idx";
ALTER INDEX "Case_userId_phase_idx" RENAME TO "Case_assignedToId_phase_idx";
ALTER INDEX "Case_userId_createdAt_idx" RENAME TO "Case_assignedToId_createdAt_idx";
ALTER TABLE "Case" RENAME CONSTRAINT "Case_userId_fkey" TO "Case_assignedToId_fkey";
