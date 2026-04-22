CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE "ObservedWordForm" (
  "normalizedForm" TEXT NOT NULL,
  "wordId" TEXT NOT NULL,
  "usageCount" INTEGER NOT NULL DEFAULT 1,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ObservedWordForm_pkey" PRIMARY KEY ("normalizedForm", "wordId")
);

CREATE INDEX "ObservedWordForm_wordId_idx"
ON "ObservedWordForm"("wordId");

CREATE INDEX "ObservedWordForm_normalizedForm_trgm_idx"
ON "ObservedWordForm" USING GIN ("normalizedForm" gin_trgm_ops);

ALTER TABLE "ObservedWordForm"
ADD CONSTRAINT "ObservedWordForm_wordId_fkey"
FOREIGN KEY ("wordId") REFERENCES "Word"("id") ON DELETE CASCADE ON UPDATE CASCADE;
