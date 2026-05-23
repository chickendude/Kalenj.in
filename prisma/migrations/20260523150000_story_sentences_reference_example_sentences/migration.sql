ALTER TABLE "StorySentence"
ADD COLUMN "exampleSentenceId" TEXT;

UPDATE "StorySentence" story
SET "exampleSentenceId" = corpus."id"
FROM "ExampleSentence" corpus
WHERE corpus."storySentenceId" = story."id";

INSERT INTO "ExampleSentence" (
  "id",
  "kalenjin",
  "english",
  "createdAt",
  "updatedAt"
)
SELECT
  'story_' || story."id",
  story."kalenjin",
  story."english",
  story."createdAt",
  story."updatedAt"
FROM "StorySentence" story
WHERE story."exampleSentenceId" IS NULL
ON CONFLICT ("id") DO NOTHING;

UPDATE "StorySentence"
SET "exampleSentenceId" = 'story_' || "id"
WHERE "exampleSentenceId" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "ExampleSentence" corpus
    WHERE corpus."id" = 'story_' || "StorySentence"."id"
  );

INSERT INTO "ExampleSentenceToken" (
  "id",
  "exampleSentenceId",
  "wordId",
  "inContextTranslation",
  "tokenOrder",
  "surfaceForm",
  "normalizedForm",
  "createdAt",
  "updatedAt"
)
SELECT
  'story_' || token."id",
  story."exampleSentenceId",
  token."wordId",
  token."inContextTranslation",
  token."tokenOrder",
  token."surfaceForm",
  token."normalizedForm",
  token."createdAt",
  token."updatedAt"
FROM "StorySentenceToken" token
JOIN "StorySentence" story
  ON story."id" = token."storySentenceId"
WHERE story."exampleSentenceId" = 'story_' || story."id"
ON CONFLICT ("exampleSentenceId", "tokenOrder") DO NOTHING;

INSERT INTO "ExampleSentenceTokenSegment" (
  "id",
  "tokenId",
  "wordId",
  "segmentOrder",
  "segmentStart",
  "segmentEnd",
  "surfaceForm",
  "normalizedForm",
  "createdAt",
  "updatedAt"
)
SELECT
  'story_' || segment."id",
  example_token."id",
  segment."wordId",
  segment."segmentOrder",
  segment."segmentStart",
  segment."segmentEnd",
  segment."surfaceForm",
  segment."normalizedForm",
  segment."createdAt",
  segment."updatedAt"
FROM "StorySentenceTokenSegment" segment
JOIN "StorySentenceToken" story_token
  ON story_token."id" = segment."tokenId"
JOIN "StorySentence" story
  ON story."id" = story_token."storySentenceId"
JOIN "ExampleSentenceToken" example_token
  ON example_token."exampleSentenceId" = story."exampleSentenceId"
  AND example_token."tokenOrder" = story_token."tokenOrder"
WHERE story."exampleSentenceId" = 'story_' || story."id"
ON CONFLICT ("tokenId", "segmentOrder") DO NOTHING;

INSERT INTO "WordSentence" ("wordId", "exampleSentenceId")
SELECT DISTINCT token."wordId", story."exampleSentenceId"
FROM "StorySentenceToken" token
JOIN "StorySentence" story
  ON story."id" = token."storySentenceId"
WHERE token."wordId" IS NOT NULL
ON CONFLICT ("wordId", "exampleSentenceId") DO NOTHING;

INSERT INTO "WordSentence" ("wordId", "exampleSentenceId")
SELECT DISTINCT segment."wordId", story."exampleSentenceId"
FROM "StorySentenceTokenSegment" segment
JOIN "StorySentenceToken" token
  ON token."id" = segment."tokenId"
JOIN "StorySentence" story
  ON story."id" = token."storySentenceId"
WHERE segment."wordId" IS NOT NULL
ON CONFLICT ("wordId", "exampleSentenceId") DO NOTHING;

ALTER TABLE "StorySentence"
ALTER COLUMN "exampleSentenceId" SET NOT NULL;

ALTER TABLE "ExampleSentence"
DROP CONSTRAINT IF EXISTS "ExampleSentence_storySentenceId_fkey";

DROP INDEX IF EXISTS "ExampleSentence_storySentenceId_key";

ALTER TABLE "ExampleSentence"
DROP COLUMN IF EXISTS "storySentenceId";

DROP TABLE IF EXISTS "StorySentenceTokenSegment";
DROP TABLE IF EXISTS "StorySentenceToken";

DROP INDEX IF EXISTS "StorySentence_kalenjin_idx";

ALTER TABLE "StorySentence"
DROP COLUMN IF EXISTS "kalenjin";

ALTER TABLE "StorySentence"
DROP COLUMN IF EXISTS "english";

CREATE UNIQUE INDEX "StorySentence_exampleSentenceId_key"
ON "StorySentence"("exampleSentenceId");

CREATE INDEX "StorySentence_exampleSentenceId_idx"
ON "StorySentence"("exampleSentenceId");

ALTER TABLE "StorySentence"
ADD CONSTRAINT "StorySentence_exampleSentenceId_fkey"
FOREIGN KEY ("exampleSentenceId") REFERENCES "ExampleSentence"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
