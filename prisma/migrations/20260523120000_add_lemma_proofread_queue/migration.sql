-- AlterTable
ALTER TABLE "ExampleSentence"
ADD COLUMN     "needsLemmaProofread" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lemmaProofreadAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ExampleSentence_needsLemmaProofread_idx" ON "ExampleSentence"("needsLemmaProofread");
