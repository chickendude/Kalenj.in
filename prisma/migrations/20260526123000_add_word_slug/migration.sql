ALTER TABLE "Word" ADD COLUMN IF NOT EXISTS "slug" TEXT;

CREATE EXTENSION IF NOT EXISTS unaccent;

DO $$
DECLARE
  row record;
  base_slug text;
  candidate_slug text;
  suffix integer;
BEGIN
  FOR row IN
    SELECT id, kalenjin, translations
    FROM "Word"
    ORDER BY kalenjin ASC, translations ASC, id ASC
  LOOP
    base_slug := regexp_replace(
      regexp_replace(
        trim(both '-' from regexp_replace(lower(unaccent(row.kalenjin)), '[^a-z0-9]+', '-', 'g')),
        '-{2,}',
        '-',
        'g'
      ),
      '^$',
      'word'
    );
    candidate_slug := base_slug;
    suffix := 0;

    IF row.id IS NOT NULL AND EXISTS (SELECT 1 FROM "Word" WHERE id = row.id AND slug IS NOT NULL) THEN
      CONTINUE;
    END IF;

    WHILE EXISTS (SELECT 1 FROM "Word" WHERE slug = candidate_slug) LOOP
      suffix := suffix + 1;
      candidate_slug := base_slug || '-' || suffix::text;
    END LOOP;

    UPDATE "Word" SET slug = candidate_slug WHERE id = row.id;
  END LOOP;
END $$;

ALTER TABLE "Word" ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Word_slug_key" ON "Word"("slug");
