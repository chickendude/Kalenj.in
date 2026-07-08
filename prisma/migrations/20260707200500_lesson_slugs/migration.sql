-- Add a unique, human-readable slug to lessons and backfill it from titles.
ALTER TABLE "Lesson" ADD COLUMN "slug" TEXT;

-- Slugify existing titles (lowercase, non-alphanumeric runs -> single dash,
-- trimmed); duplicate titles get -1, -2, ... suffixes ordered by course
-- position so the earliest lesson keeps the clean slug.
WITH base AS (
    SELECT
        id,
        trim(BOTH '-' FROM regexp_replace(lower(title), '[^a-z0-9]+', '-', 'g')) AS base_slug
    FROM "Lesson"
),
numbered AS (
    SELECT
        b.id,
        b.base_slug,
        row_number() OVER (
            PARTITION BY b.base_slug
            ORDER BY l."level", l."lessonOrder", b.id
        ) AS rn
    FROM base b
    JOIN "Lesson" l ON l.id = b.id
)
UPDATE "Lesson" l
SET "slug" = CASE
    WHEN n.base_slug = '' THEN l.id
    WHEN n.rn = 1 THEN n.base_slug
    ELSE n.base_slug || '-' || (n.rn - 1)
END
FROM numbered n
WHERE n.id = l.id;

ALTER TABLE "Lesson" ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX "Lesson_slug_key" ON "Lesson"("slug");
