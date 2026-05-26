-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('WORD', 'SENTENCE');

-- CreateEnum
CREATE TYPE "ReportIssueType" AS ENUM ('WRONG_TRANSLATION', 'MISSPELLING', 'AUDIO_ISSUE', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "targetType" "ReportTargetType" NOT NULL,
    "wordId" TEXT,
    "sentenceId" TEXT,
    "issueType" "ReportIssueType" NOT NULL,
    "suggestedFix" TEXT,
    "reporterId" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Report_wordId_idx" ON "Report"("wordId");

-- CreateIndex
CREATE INDEX "Report_sentenceId_idx" ON "Report"("sentenceId");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_sentenceId_fkey" FOREIGN KEY ("sentenceId") REFERENCES "ExampleSentence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
