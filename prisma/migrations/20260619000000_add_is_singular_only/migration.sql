-- AlterTable
ALTER TABLE "Word" ADD COLUMN "isSingularOnly" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "WordSuggestion" ADD COLUMN "isSingularOnly" BOOLEAN NOT NULL DEFAULT false;
