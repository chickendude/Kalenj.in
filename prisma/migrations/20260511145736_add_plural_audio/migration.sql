-- AlterTable
ALTER TABLE "Word" ADD COLUMN     "pluralAudioRecordedAt" TIMESTAMP(3),
ADD COLUMN     "pluralAudioRecordedById" TEXT,
ADD COLUMN     "pluralAudioUrl" TEXT;

-- AddForeignKey
ALTER TABLE "Word" ADD CONSTRAINT "Word_pluralAudioRecordedById_fkey" FOREIGN KEY ("pluralAudioRecordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
