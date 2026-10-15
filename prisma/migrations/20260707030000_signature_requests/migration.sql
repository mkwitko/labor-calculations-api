-- CreateEnum
CREATE TYPE "SignatureStatus" AS ENUM ('pending', 'signed', 'failed');

-- CreateTable
CREATE TABLE "SignatureRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "caseId" TEXT,
    "documentName" TEXT NOT NULL,
    "sourceFileKey" TEXT NOT NULL,
    "signedFileKey" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'govbr',
    "status" "SignatureStatus" NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignatureRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SignatureRequest_userId_idx" ON "SignatureRequest"("userId");

-- CreateIndex
CREATE INDEX "SignatureRequest_caseId_idx" ON "SignatureRequest"("caseId");

-- AddForeignKey
ALTER TABLE "SignatureRequest" ADD CONSTRAINT "SignatureRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureRequest" ADD CONSTRAINT "SignatureRequest_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

