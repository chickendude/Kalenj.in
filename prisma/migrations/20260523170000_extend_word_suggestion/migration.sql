-- AlterTable
ALTER TABLE "WordSuggestion" ADD COLUMN "alternativeSpellings" TEXT;
ALTER TABLE "WordSuggestion" ADD COLUMN "pluralForm" TEXT;
ALTER TABLE "WordSuggestion" ADD COLUMN "isPluralOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WordSuggestion" ADD COLUMN "alternativePluralForms" TEXT;
ALTER TABLE "WordSuggestion" ADD COLUMN "presentAnee" TEXT;
ALTER TABLE "WordSuggestion" ADD COLUMN "presentInyee" TEXT;
ALTER TABLE "WordSuggestion" ADD COLUMN "presentInee" TEXT;
ALTER TABLE "WordSuggestion" ADD COLUMN "presentEchek" TEXT;
ALTER TABLE "WordSuggestion" ADD COLUMN "presentOkwek" TEXT;
ALTER TABLE "WordSuggestion" ADD COLUMN "presentIchek" TEXT;
