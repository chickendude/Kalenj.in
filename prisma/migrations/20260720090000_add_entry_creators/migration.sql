-- AlterTable
ALTER TABLE "Word" ADD COLUMN "createdById" TEXT;

-- AlterTable
ALTER TABLE "ExampleSentence" ADD COLUMN "createdById" TEXT;

-- CreateIndex
CREATE INDEX "Word_createdById_idx" ON "Word"("createdById");

-- CreateIndex
CREATE INDEX "ExampleSentence_createdById_idx" ON "ExampleSentence"("createdById");

-- AddForeignKey
ALTER TABLE "Word" ADD CONSTRAINT "Word_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExampleSentence" ADD CONSTRAINT "ExampleSentence_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
