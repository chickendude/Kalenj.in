-- Cleanup: delete orphaned ExampleSentence rows with empty text.
-- "Orphan" = not referenced by any LessonWord.
DELETE FROM "ExampleSentence"
WHERE (TRIM("kalenjin") = '' OR TRIM("english") = '')
  AND NOT EXISTS (
    SELECT 1 FROM "LessonWord" WHERE "LessonWord"."sentenceId" = "ExampleSentence"."id"
  );

-- Cleanup: for duplicate groups (same trimmed, case-insensitive kalenjin + english),
-- if any row in the group is owned by a LessonWord, delete the orphan duplicates.
DELETE FROM "ExampleSentence" AS o
WHERE NOT EXISTS (
    SELECT 1 FROM "LessonWord" WHERE "LessonWord"."sentenceId" = o."id"
  )
  AND EXISTS (
    SELECT 1
    FROM "ExampleSentence" AS x
    INNER JOIN "LessonWord" ON "LessonWord"."sentenceId" = x."id"
    WHERE LOWER(TRIM(x."kalenjin")) = LOWER(TRIM(o."kalenjin"))
      AND LOWER(TRIM(x."english")) = LOWER(TRIM(o."english"))
      AND x."id" <> o."id"
  );

-- Cleanup: collapse groups of orphan duplicates to a single row (keep the oldest).
WITH orphan_dupes AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(TRIM("kalenjin")), LOWER(TRIM("english"))
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS rn
  FROM "ExampleSentence"
  WHERE NOT EXISTS (
    SELECT 1 FROM "LessonWord" WHERE "LessonWord"."sentenceId" = "ExampleSentence"."id"
  )
)
DELETE FROM "ExampleSentence"
WHERE "id" IN (SELECT "id" FROM orphan_dupes WHERE rn > 1);

-- Enforce 1:1 between LessonWord and ExampleSentence going forward.
DROP INDEX "LessonWord_sentenceId_idx";
CREATE UNIQUE INDEX "LessonWord_sentenceId_key" ON "LessonWord"("sentenceId");
