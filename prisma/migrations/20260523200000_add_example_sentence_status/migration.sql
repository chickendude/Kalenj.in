-- CreateEnum
CREATE TYPE "ExampleSentenceStatus" AS ENUM ('NEEDS_PROOFREAD', 'IN_CORPUS', 'STORY_ONLY');

-- AlterTable
ALTER TABLE "ExampleSentence"
ADD COLUMN "status" "ExampleSentenceStatus" NOT NULL DEFAULT 'NEEDS_PROOFREAD';

-- Backfill from existing needsLemmaProofread values
UPDATE "ExampleSentence"
SET "status" = CASE WHEN "needsLemmaProofread" THEN 'NEEDS_PROOFREAD'::"ExampleSentenceStatus" ELSE 'IN_CORPUS'::"ExampleSentenceStatus" END;

-- DropIndex
DROP INDEX "ExampleSentence_needsLemmaProofread_idx";

-- AlterTable
ALTER TABLE "ExampleSentence" DROP COLUMN "needsLemmaProofread";

-- CreateIndex
CREATE INDEX "ExampleSentence_status_idx" ON "ExampleSentence"("status");
