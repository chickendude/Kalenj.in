-- AlterTable
ALTER TABLE "Word"
ADD COLUMN "kalenjinNormalized" TEXT NOT NULL DEFAULT '',
ADD COLUMN "pluralForm" TEXT,
ADD COLUMN "pluralFormNormalized" TEXT;

-- Backfill normalized existing values
UPDATE "Word"
SET
  "kalenjinNormalized" = LOWER(TRIM("kalenjin")),
  "pluralFormNormalized" = CASE
    WHEN "pluralForm" IS NULL THEN NULL
    ELSE LOWER(TRIM("pluralForm"))
  END;

-- CreateTable
CREATE TABLE "WordSpelling" (
  "id" TEXT NOT NULL,
  "wordId" TEXT NOT NULL,
  "spelling" TEXT NOT NULL,
  "spellingNormalized" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WordSpelling_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Word_kalenjinNormalized_idx" ON "Word"("kalenjinNormalized");
CREATE INDEX "Word_pluralFormNormalized_idx" ON "Word"("pluralFormNormalized");
CREATE UNIQUE INDEX "WordSpelling_wordId_spellingNormalized_key" ON "WordSpelling"("wordId", "spellingNormalized");
CREATE INDEX "WordSpelling_spellingNormalized_idx" ON "WordSpelling"("spellingNormalized");

-- AddForeignKey
ALTER TABLE "WordSpelling"
ADD CONSTRAINT "WordSpelling_wordId_fkey"
FOREIGN KEY ("wordId") REFERENCES "Word"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
