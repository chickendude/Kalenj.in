-- AlterTable
ALTER TABLE "ExampleSentence" ADD COLUMN     "audioRecordedAt" TIMESTAMP(3),
ADD COLUMN     "audioRecordedById" TEXT;

-- AlterTable
ALTER TABLE "Word" ADD COLUMN     "audioRecordedAt" TIMESTAMP(3),
ADD COLUMN     "audioRecordedById" TEXT;

-- AddForeignKey
ALTER TABLE "Word" ADD CONSTRAINT "Word_audioRecordedById_fkey" FOREIGN KEY ("audioRecordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExampleSentence" ADD CONSTRAINT "ExampleSentence_audioRecordedById_fkey" FOREIGN KEY ("audioRecordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
