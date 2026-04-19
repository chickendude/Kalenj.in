WITH grouped AS (
  SELECT
    "exampleSentenceId",
    "wordIndex",
    (array_agg("id" ORDER BY "tokenOrder"))[1] AS "keepId",
    string_agg("surfaceForm", ' ' ORDER BY "tokenOrder") AS "surfaceForm",
    string_agg("normalizedForm", ' ' ORDER BY "tokenOrder") AS "normalizedForm",
    NULLIF(string_agg(NULLIF(btrim("inContextTranslation"), ''), ' ' ORDER BY "tokenOrder"), '') AS "inContextTranslation",
    (array_agg("wordId" ORDER BY "tokenOrder") FILTER (WHERE "wordId" IS NOT NULL))[1] AS "wordId"
  FROM "ExampleSentenceToken"
  GROUP BY "exampleSentenceId", "wordIndex"
  HAVING count(*) > 1
)
UPDATE "ExampleSentenceToken" token
SET
  "surfaceForm" = grouped."surfaceForm",
  "normalizedForm" = grouped."normalizedForm",
  "inContextTranslation" = grouped."inContextTranslation",
  "wordId" = COALESCE(token."wordId", grouped."wordId")
FROM grouped
WHERE token."id" = grouped."keepId";

WITH grouped AS (
  SELECT
    "exampleSentenceId",
    "wordIndex",
    (array_agg("id" ORDER BY "tokenOrder"))[1] AS "keepId"
  FROM "ExampleSentenceToken"
  GROUP BY "exampleSentenceId", "wordIndex"
  HAVING count(*) > 1
)
DELETE FROM "ExampleSentenceToken" token
USING grouped
WHERE
  token."exampleSentenceId" = grouped."exampleSentenceId"
  AND token."wordIndex" = grouped."wordIndex"
  AND token."id" <> grouped."keepId";

WITH ordered AS (
  SELECT
    "id",
    (row_number() OVER (PARTITION BY "exampleSentenceId" ORDER BY "tokenOrder") - 1)::integer AS "nextOrder"
  FROM "ExampleSentenceToken"
)
UPDATE "ExampleSentenceToken" token
SET "tokenOrder" = ordered."nextOrder"
FROM ordered
WHERE token."id" = ordered."id";

WITH grouped AS (
  SELECT
    "storySentenceId",
    "wordIndex",
    (array_agg("id" ORDER BY "tokenOrder"))[1] AS "keepId",
    string_agg("surfaceForm", ' ' ORDER BY "tokenOrder") AS "surfaceForm",
    string_agg("normalizedForm", ' ' ORDER BY "tokenOrder") AS "normalizedForm",
    NULLIF(string_agg(NULLIF(btrim("inContextTranslation"), ''), ' ' ORDER BY "tokenOrder"), '') AS "inContextTranslation",
    (array_agg("wordId" ORDER BY "tokenOrder") FILTER (WHERE "wordId" IS NOT NULL))[1] AS "wordId"
  FROM "StorySentenceToken"
  GROUP BY "storySentenceId", "wordIndex"
  HAVING count(*) > 1
)
UPDATE "StorySentenceToken" token
SET
  "surfaceForm" = grouped."surfaceForm",
  "normalizedForm" = grouped."normalizedForm",
  "inContextTranslation" = grouped."inContextTranslation",
  "wordId" = COALESCE(token."wordId", grouped."wordId")
FROM grouped
WHERE token."id" = grouped."keepId";

WITH grouped AS (
  SELECT
    "storySentenceId",
    "wordIndex",
    (array_agg("id" ORDER BY "tokenOrder"))[1] AS "keepId"
  FROM "StorySentenceToken"
  GROUP BY "storySentenceId", "wordIndex"
  HAVING count(*) > 1
)
DELETE FROM "StorySentenceToken" token
USING grouped
WHERE
  token."storySentenceId" = grouped."storySentenceId"
  AND token."wordIndex" = grouped."wordIndex"
  AND token."id" <> grouped."keepId";

WITH ordered AS (
  SELECT
    "id",
    (row_number() OVER (PARTITION BY "storySentenceId" ORDER BY "tokenOrder") - 1)::integer AS "nextOrder"
  FROM "StorySentenceToken"
)
UPDATE "StorySentenceToken" token
SET "tokenOrder" = ordered."nextOrder"
FROM ordered
WHERE token."id" = ordered."id";

DROP INDEX IF EXISTS "ExampleSentenceToken_exampleSentenceId_wordIndex_idx";
DROP INDEX IF EXISTS "StorySentenceToken_storySentenceId_wordIndex_idx";

ALTER TABLE "ExampleSentenceToken"
DROP COLUMN IF EXISTS "wordIndex",
DROP COLUMN IF EXISTS "segmentStart",
DROP COLUMN IF EXISTS "segmentEnd";

ALTER TABLE "StorySentenceToken"
DROP COLUMN IF EXISTS "wordIndex",
DROP COLUMN IF EXISTS "segmentStart",
DROP COLUMN IF EXISTS "segmentEnd";
