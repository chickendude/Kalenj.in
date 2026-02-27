CREATE TABLE "ExampleSentenceToken" (
    "id" TEXT NOT NULL,
    "exampleSentenceId" TEXT NOT NULL,
    "wordId" TEXT,
    "tokenOrder" INTEGER NOT NULL,
    "surfaceForm" TEXT NOT NULL,
    "normalizedForm" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExampleSentenceToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExampleSentenceToken_exampleSentenceId_tokenOrder_key" ON "ExampleSentenceToken"("exampleSentenceId", "tokenOrder");
CREATE INDEX "ExampleSentenceToken_exampleSentenceId_idx" ON "ExampleSentenceToken"("exampleSentenceId");
CREATE INDEX "ExampleSentenceToken_wordId_idx" ON "ExampleSentenceToken"("wordId");
CREATE INDEX "ExampleSentenceToken_normalizedForm_idx" ON "ExampleSentenceToken"("normalizedForm");

ALTER TABLE "ExampleSentenceToken"
ADD CONSTRAINT "ExampleSentenceToken_exampleSentenceId_fkey"
FOREIGN KEY ("exampleSentenceId") REFERENCES "ExampleSentence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExampleSentenceToken"
ADD CONSTRAINT "ExampleSentenceToken_wordId_fkey"
FOREIGN KEY ("wordId") REFERENCES "Word"("id") ON DELETE SET NULL ON UPDATE CASCADE;
