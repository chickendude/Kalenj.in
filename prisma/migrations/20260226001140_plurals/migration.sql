-- Rebuilt migration.
--
-- The original migration file was missing from the repository, but this
-- migration is already recorded in local databases. The plural columns and
-- indexes are introduced by the preceding
-- 20260221153000_word_plural_and_spellings migration; keep this migration as a
-- guarded normalization pass so fresh databases can apply the historical
-- migration sequence without changing the resulting schema.

ALTER TABLE "Word"
ADD COLUMN IF NOT EXISTS "pluralForm" TEXT,
ADD COLUMN IF NOT EXISTS "pluralFormNormalized" TEXT;

UPDATE "Word"
SET "pluralFormNormalized" = LOWER(TRIM("pluralForm"))
WHERE "pluralForm" IS NOT NULL
  AND (
    "pluralFormNormalized" IS NULL
    OR "pluralFormNormalized" <> LOWER(TRIM("pluralForm"))
  );

CREATE INDEX IF NOT EXISTS "Word_pluralFormNormalized_idx" ON "Word"("pluralFormNormalized");

ALTER TABLE "Word"
ALTER COLUMN "kalenjinNormalized" DROP DEFAULT;
