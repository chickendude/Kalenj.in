CREATE TABLE "ExampleSentenceCompound" (
  "id" TEXT NOT NULL,
  "exampleSentenceId" TEXT NOT NULL,
  "wordId" TEXT,
  "normalizedForm" TEXT NOT NULL,
  "inContextTranslation" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExampleSentenceCompound_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExampleSentenceCompound_exampleSentenceId_idx"
ON "ExampleSentenceCompound"("exampleSentenceId");

CREATE INDEX "ExampleSentenceCompound_wordId_idx"
ON "ExampleSentenceCompound"("wordId");

CREATE INDEX "ExampleSentenceCompound_normalizedForm_idx"
ON "ExampleSentenceCompound"("normalizedForm");

ALTER TABLE "ExampleSentenceCompound"
ADD CONSTRAINT "ExampleSentenceCompound_exampleSentenceId_fkey"
FOREIGN KEY ("exampleSentenceId") REFERENCES "ExampleSentence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExampleSentenceCompound"
ADD CONSTRAINT "ExampleSentenceCompound_wordId_fkey"
FOREIGN KEY ("wordId") REFERENCES "Word"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ExampleSentenceToken" ADD COLUMN "compoundId" TEXT;

CREATE INDEX "ExampleSentenceToken_compoundId_idx"
ON "ExampleSentenceToken"("compoundId");

ALTER TABLE "ExampleSentenceToken"
ADD CONSTRAINT "ExampleSentenceToken_compoundId_fkey"
FOREIGN KEY ("compoundId") REFERENCES "ExampleSentenceCompound"("id") ON DELETE SET NULL ON UPDATE CASCADE;
