CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Word_kalenjinNormalized_trgm_idx"
ON "Word" USING GIN ("kalenjinNormalized" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Word_pluralFormNormalized_trgm_idx"
ON "Word" USING GIN ("pluralFormNormalized" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "WordSpelling_spellingNormalized_trgm_idx"
ON "WordSpelling" USING GIN ("spellingNormalized" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "ExampleSentence_kalenjin_trgm_idx"
ON "ExampleSentence" USING GIN ("kalenjin" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "ExampleSentence_english_trgm_idx"
ON "ExampleSentence" USING GIN ("english" gin_trgm_ops);
