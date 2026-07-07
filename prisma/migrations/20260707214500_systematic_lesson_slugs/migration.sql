-- Replace title-based lesson slugs with systematic ones: vocabulary lessons
-- become lesson-1, lesson-2, ... and story lessons story-1, story-2, ...,
-- numbered by course position (level, then lessonOrder, drafts included).

-- Park every slug on a collision-free value first (a title-based slug could
-- already be "lesson-1").
UPDATE "Lesson" SET "slug" = 'tmp-' || id;

WITH numbered AS (
    SELECT
        id,
        type,
        row_number() OVER (PARTITION BY type ORDER BY "level", "lessonOrder") AS rn
    FROM "Lesson"
)
UPDATE "Lesson" l
SET "slug" = CASE WHEN n.type = 'STORY' THEN 'story-' || n.rn ELSE 'lesson-' || n.rn END
FROM numbered n
WHERE n.id = l.id;
