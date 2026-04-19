CREATE TABLE "ExampleSentenceTokenSegment" (
  "id" TEXT NOT NULL,
  "tokenId" TEXT NOT NULL,
  "wordId" TEXT,
  "segmentOrder" INTEGER NOT NULL,
  "segmentStart" INTEGER NOT NULL,
  "segmentEnd" INTEGER NOT NULL,
  "surfaceForm" TEXT NOT NULL,
  "normalizedForm" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExampleSentenceTokenSegment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StorySentenceTokenSegment" (
  "id" TEXT NOT NULL,
  "tokenId" TEXT NOT NULL,
  "wordId" TEXT,
  "segmentOrder" INTEGER NOT NULL,
  "segmentStart" INTEGER NOT NULL,
  "segmentEnd" INTEGER NOT NULL,
  "surfaceForm" TEXT NOT NULL,
  "normalizedForm" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StorySentenceTokenSegment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExampleSentenceTokenSegment_tokenId_segmentOrder_key"
ON "ExampleSentenceTokenSegment"("tokenId", "segmentOrder");

CREATE INDEX "ExampleSentenceTokenSegment_tokenId_idx"
ON "ExampleSentenceTokenSegment"("tokenId");

CREATE INDEX "ExampleSentenceTokenSegment_wordId_idx"
ON "ExampleSentenceTokenSegment"("wordId");

CREATE INDEX "ExampleSentenceTokenSegment_normalizedForm_idx"
ON "ExampleSentenceTokenSegment"("normalizedForm");

CREATE UNIQUE INDEX "StorySentenceTokenSegment_tokenId_segmentOrder_key"
ON "StorySentenceTokenSegment"("tokenId", "segmentOrder");

CREATE INDEX "StorySentenceTokenSegment_tokenId_idx"
ON "StorySentenceTokenSegment"("tokenId");

CREATE INDEX "StorySentenceTokenSegment_wordId_idx"
ON "StorySentenceTokenSegment"("wordId");

CREATE INDEX "StorySentenceTokenSegment_normalizedForm_idx"
ON "StorySentenceTokenSegment"("normalizedForm");

ALTER TABLE "ExampleSentenceTokenSegment"
ADD CONSTRAINT "ExampleSentenceTokenSegment_tokenId_fkey"
FOREIGN KEY ("tokenId") REFERENCES "ExampleSentenceToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExampleSentenceTokenSegment"
ADD CONSTRAINT "ExampleSentenceTokenSegment_wordId_fkey"
FOREIGN KEY ("wordId") REFERENCES "Word"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StorySentenceTokenSegment"
ADD CONSTRAINT "StorySentenceTokenSegment_tokenId_fkey"
FOREIGN KEY ("tokenId") REFERENCES "StorySentenceToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StorySentenceTokenSegment"
ADD CONSTRAINT "StorySentenceTokenSegment_wordId_fkey"
FOREIGN KEY ("wordId") REFERENCES "Word"("id") ON DELETE SET NULL ON UPDATE CASCADE;
