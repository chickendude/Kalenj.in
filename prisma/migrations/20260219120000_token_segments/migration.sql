ALTER TABLE "ExampleSentenceToken"
ADD COLUMN "wordIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "segmentStart" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "segmentEnd" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "ExampleSentenceToken_exampleSentenceId_wordIndex_idx"
ON "ExampleSentenceToken"("exampleSentenceId", "wordIndex");
