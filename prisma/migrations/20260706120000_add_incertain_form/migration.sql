-- AlterTable
ALTER TABLE "Word" ADD COLUMN     "incertainForm" TEXT,
ADD COLUMN     "incertainFormNormalized" TEXT,
ADD COLUMN     "incertainAudioUrl" TEXT,
ADD COLUMN     "incertainAudioRecordedById" TEXT,
ADD COLUMN     "incertainAudioRecordedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WordSuggestion" ADD COLUMN     "incertainForm" TEXT;

-- AddForeignKey
ALTER TABLE "Word" ADD CONSTRAINT "Word_incertainAudioRecordedById_fkey" FOREIGN KEY ("incertainAudioRecordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Word_incertainFormNormalized_idx" ON "Word"("incertainFormNormalized");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Word_incertainFormNormalized_trgm_idx"
ON "Word" USING GIN ("incertainFormNormalized" gin_trgm_ops);
