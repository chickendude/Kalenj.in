CREATE INDEX IF NOT EXISTS "Word_translations_trgm_idx"
ON "Word" USING GIN ("translations" gin_trgm_ops);
