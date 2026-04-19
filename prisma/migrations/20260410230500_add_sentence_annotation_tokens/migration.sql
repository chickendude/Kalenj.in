ALTER TABLE "ExampleSentenceToken"
ADD COLUMN "inContextTranslation" TEXT;

CREATE TABLE "StorySentenceToken" (
  "id" TEXT NOT NULL,
  "storySentenceId" TEXT NOT NULL,
  "wordId" TEXT,
  "inContextTranslation" TEXT,
  "tokenOrder" INTEGER NOT NULL,
  "wordIndex" INTEGER NOT NULL DEFAULT 0,
  "segmentStart" INTEGER NOT NULL DEFAULT 0,
  "segmentEnd" INTEGER NOT NULL DEFAULT 0,
  "surfaceForm" TEXT NOT NULL,
  "normalizedForm" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StorySentenceToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StorySentenceToken_storySentenceId_tokenOrder_key" ON "StorySentenceToken"("storySentenceId", "tokenOrder");
CREATE INDEX "StorySentenceToken_storySentenceId_idx" ON "StorySentenceToken"("storySentenceId");
CREATE INDEX "StorySentenceToken_wordId_idx" ON "StorySentenceToken"("wordId");
CREATE INDEX "StorySentenceToken_normalizedForm_idx" ON "StorySentenceToken"("normalizedForm");
CREATE INDEX "StorySentenceToken_storySentenceId_wordIndex_idx" ON "StorySentenceToken"("storySentenceId", "wordIndex");

ALTER TABLE "StorySentenceToken"
ADD CONSTRAINT "StorySentenceToken_storySentenceId_fkey" FOREIGN KEY ("storySentenceId") REFERENCES "StorySentence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StorySentenceToken"
ADD CONSTRAINT "StorySentenceToken_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word"("id") ON DELETE SET NULL ON UPDATE CASCADE;
