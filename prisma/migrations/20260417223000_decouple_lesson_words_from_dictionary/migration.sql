ALTER TABLE "LessonWord"
ADD COLUMN "kalenjin" TEXT,
ADD COLUMN "translations" TEXT;

UPDATE "LessonWord" lw
SET
  "kalenjin" = w."kalenjin",
  "translations" = w."translations"
FROM "Word" w
WHERE lw."wordId" = w."id";

UPDATE "LessonWord"
SET
  "kalenjin" = COALESCE("kalenjin", ''),
  "translations" = COALESCE("translations", '');

ALTER TABLE "LessonWord"
ALTER COLUMN "kalenjin" SET NOT NULL,
ALTER COLUMN "translations" SET NOT NULL,
ALTER COLUMN "wordId" DROP NOT NULL;

ALTER TABLE "LessonWord" DROP CONSTRAINT "LessonWord_wordId_fkey";

ALTER TABLE "LessonWord"
ADD CONSTRAINT "LessonWord_wordId_fkey"
FOREIGN KEY ("wordId") REFERENCES "Word"("id") ON DELETE SET NULL ON UPDATE CASCADE;
