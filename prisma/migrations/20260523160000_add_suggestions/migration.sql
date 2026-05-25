-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "WordSuggestion" (
    "id" TEXT NOT NULL,
    "kalenjin" TEXT NOT NULL,
    "translations" TEXT NOT NULL,
    "partOfSpeech" "PartOfSpeech",
    "notes" TEXT,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "submitterId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "approvedWordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WordSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WordSuggestion_status_idx" ON "WordSuggestion"("status");

-- CreateIndex
CREATE INDEX "WordSuggestion_submitterId_idx" ON "WordSuggestion"("submitterId");

-- CreateIndex
CREATE INDEX "WordSuggestion_createdAt_idx" ON "WordSuggestion"("createdAt");

-- AddForeignKey
ALTER TABLE "WordSuggestion" ADD CONSTRAINT "WordSuggestion_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WordSuggestion" ADD CONSTRAINT "WordSuggestion_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WordSuggestion" ADD CONSTRAINT "WordSuggestion_approvedWordId_fkey" FOREIGN KEY ("approvedWordId") REFERENCES "Word"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "SentenceSuggestion" (
    "id" TEXT NOT NULL,
    "kalenjin" TEXT NOT NULL,
    "english" TEXT NOT NULL,
    "notes" TEXT,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "submitterId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "approvedSentenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SentenceSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SentenceSuggestion_status_idx" ON "SentenceSuggestion"("status");

-- CreateIndex
CREATE INDEX "SentenceSuggestion_submitterId_idx" ON "SentenceSuggestion"("submitterId");

-- CreateIndex
CREATE INDEX "SentenceSuggestion_createdAt_idx" ON "SentenceSuggestion"("createdAt");

-- AddForeignKey
ALTER TABLE "SentenceSuggestion" ADD CONSTRAINT "SentenceSuggestion_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentenceSuggestion" ADD CONSTRAINT "SentenceSuggestion_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentenceSuggestion" ADD CONSTRAINT "SentenceSuggestion_approvedSentenceId_fkey" FOREIGN KEY ("approvedSentenceId") REFERENCES "ExampleSentence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
