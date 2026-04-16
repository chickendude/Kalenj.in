ALTER TABLE "Word"
RENAME COLUMN "english" TO "translations";

ALTER TABLE "Word"
DROP COLUMN "definition";

DROP INDEX IF EXISTS "Word_english_idx";

CREATE INDEX "Word_translations_idx" ON "Word"("translations");
