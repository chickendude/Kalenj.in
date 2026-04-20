ALTER TABLE "ExampleSentence"
ADD COLUMN "storySentenceId" TEXT;

CREATE UNIQUE INDEX "ExampleSentence_storySentenceId_key"
ON "ExampleSentence"("storySentenceId");

ALTER TABLE "ExampleSentence"
ADD CONSTRAINT "ExampleSentence_storySentenceId_fkey"
FOREIGN KEY ("storySentenceId") REFERENCES "StorySentence"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ExampleSentence" (
  "id",
  "storySentenceId",
  "kalenjin",
  "english",
  "notes",
  "createdAt",
  "updatedAt"
)
SELECT
  'story-corpus-' || sentence."id",
  sentence."id",
  sentence."kalenjin",
  sentence."english",
  NULL,
  sentence."createdAt",
  sentence."updatedAt"
FROM "StorySentence" sentence
LEFT JOIN "ExampleSentence" corpus
  ON corpus."storySentenceId" = sentence."id"
WHERE corpus."id" IS NULL;

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
  'story-corpus-token-' || token."id",
  corpus."id",
  token."wordId",
  token."inContextTranslation",
  token."tokenOrder",
  token."surfaceForm",
  token."normalizedForm",
  token."createdAt",
  token."updatedAt"
FROM "StorySentenceToken" token
JOIN "ExampleSentence" corpus
  ON corpus."storySentenceId" = token."storySentenceId";

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
  'story-corpus-segment-' || segment."id",
  corpus_token."id",
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
JOIN "ExampleSentenceToken" corpus_token
  ON corpus_token."id" = 'story-corpus-token-' || story_token."id";

INSERT INTO "WordSentence" ("wordId", "exampleSentenceId")
SELECT DISTINCT linked."wordId", linked."exampleSentenceId"
FROM (
  SELECT token."wordId", corpus."id" AS "exampleSentenceId"
  FROM "StorySentenceToken" token
  JOIN "ExampleSentence" corpus
    ON corpus."storySentenceId" = token."storySentenceId"
  WHERE token."wordId" IS NOT NULL

  UNION

  SELECT segment."wordId", corpus."id" AS "exampleSentenceId"
  FROM "StorySentenceTokenSegment" segment
  JOIN "StorySentenceToken" token
    ON token."id" = segment."tokenId"
  JOIN "ExampleSentence" corpus
    ON corpus."storySentenceId" = token."storySentenceId"
  WHERE segment."wordId" IS NOT NULL
) linked
ON CONFLICT DO NOTHING;
