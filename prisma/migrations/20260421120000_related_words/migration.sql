CREATE TABLE "RelatedWord" (
    "id" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "relatedWordId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RelatedWord_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RelatedWord_distinct_words" CHECK ("wordId" <> "relatedWordId"),
    CONSTRAINT "RelatedWord_ordered_pair" CHECK ("wordId" < "relatedWordId")
);

CREATE UNIQUE INDEX "RelatedWord_wordId_relatedWordId_key" ON "RelatedWord"("wordId", "relatedWordId");
CREATE INDEX "RelatedWord_relatedWordId_idx" ON "RelatedWord"("relatedWordId");

ALTER TABLE "RelatedWord" ADD CONSTRAINT "RelatedWord_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RelatedWord" ADD CONSTRAINT "RelatedWord_relatedWordId_fkey" FOREIGN KEY ("relatedWordId") REFERENCES "Word"("id") ON DELETE CASCADE ON UPDATE CASCADE;
