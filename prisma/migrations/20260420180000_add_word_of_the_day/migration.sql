-- CreateTable
CREATE TABLE "WordOfTheDay" (
  "id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "wordId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WordOfTheDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WordOfTheDay_date_key" ON "WordOfTheDay"("date");

-- CreateIndex
CREATE INDEX "WordOfTheDay_wordId_idx" ON "WordOfTheDay"("wordId");

-- CreateIndex
CREATE INDEX "WordOfTheDay_date_idx" ON "WordOfTheDay"("date");

-- AddForeignKey
ALTER TABLE "WordOfTheDay"
ADD CONSTRAINT "WordOfTheDay_wordId_fkey"
FOREIGN KEY ("wordId") REFERENCES "Word"("id") ON DELETE CASCADE ON UPDATE CASCADE;
