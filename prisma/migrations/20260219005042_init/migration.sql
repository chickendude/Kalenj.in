-- CreateEnum
CREATE TYPE "PartOfSpeech" AS ENUM ('NOUN', 'VERB', 'ADJECTIVE', 'ADVERB', 'PRONOUN', 'PREPOSITION', 'CONJUNCTION', 'INTERJECTION', 'PHRASE', 'OTHER');

-- CreateTable
CREATE TABLE "Word" (
    "id" TEXT NOT NULL,
    "kalenjin" TEXT NOT NULL,
    "english" TEXT NOT NULL,
    "partOfSpeech" "PartOfSpeech",
    "definition" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Word_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExampleSentence" (
    "id" TEXT NOT NULL,
    "kalenjin" TEXT NOT NULL,
    "english" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExampleSentence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WordSentence" (
    "wordId" TEXT NOT NULL,
    "exampleSentenceId" TEXT NOT NULL,

    CONSTRAINT "WordSentence_pkey" PRIMARY KEY ("wordId","exampleSentenceId")
);

-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorySentence" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "sentenceOrder" INTEGER NOT NULL,
    "kalenjin" TEXT NOT NULL,
    "english" TEXT NOT NULL,
    "grammarNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorySentence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Word_kalenjin_idx" ON "Word"("kalenjin");

-- CreateIndex
CREATE INDEX "Word_english_idx" ON "Word"("english");

-- CreateIndex
CREATE INDEX "ExampleSentence_kalenjin_idx" ON "ExampleSentence"("kalenjin");

-- CreateIndex
CREATE INDEX "WordSentence_exampleSentenceId_idx" ON "WordSentence"("exampleSentenceId");

-- CreateIndex
CREATE INDEX "StorySentence_storyId_idx" ON "StorySentence"("storyId");

-- CreateIndex
CREATE INDEX "StorySentence_kalenjin_idx" ON "StorySentence"("kalenjin");

-- CreateIndex
CREATE UNIQUE INDEX "StorySentence_storyId_sentenceOrder_key" ON "StorySentence"("storyId", "sentenceOrder");

-- AddForeignKey
ALTER TABLE "WordSentence" ADD CONSTRAINT "WordSentence_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WordSentence" ADD CONSTRAINT "WordSentence_exampleSentenceId_fkey" FOREIGN KEY ("exampleSentenceId") REFERENCES "ExampleSentence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorySentence" ADD CONSTRAINT "StorySentence_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;
