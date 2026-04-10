-- CreateEnum
CREATE TYPE "CefrLevel" AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1');

-- CreateEnum
CREATE TYPE "PublishStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "CourseLessonType" AS ENUM ('VOCABULARY', 'STORY');

-- CreateEnum
CREATE TYPE "VocabularyLessonType" AS ENUM ('GRAMMAR', 'VOCAB', 'EXPRESSION');

-- CreateTable
CREATE TABLE "CefrEnglishTarget" (
    "id" TEXT NOT NULL,
    "level" "CefrLevel" NOT NULL,
    "english" TEXT NOT NULL,
    "notes" TEXT,
    "coveredByLessonWordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CefrEnglishTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL,
    "level" "CefrLevel" NOT NULL,
    "title" TEXT NOT NULL,
    "lessonOrder" INTEGER NOT NULL,
    "type" "CourseLessonType" NOT NULL,
    "vocabularyType" "VocabularyLessonType",
    "grammarMarkdown" TEXT,
    "notes" TEXT,
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "storyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonSection" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "title" TEXT,
    "sectionOrder" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonWord" (
    "id" TEXT NOT NULL,
    "lessonSectionId" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "itemOrder" INTEGER NOT NULL,
    "sentenceId" TEXT NOT NULL,
    "sentenceTranslation" TEXT,
    "wordForWordTranslation" TEXT,
    "notesMarkdown" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonWord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CefrEnglishTarget_english_key" ON "CefrEnglishTarget"("english");

-- CreateIndex
CREATE INDEX "CefrEnglishTarget_level_idx" ON "CefrEnglishTarget"("level");

-- CreateIndex
CREATE INDEX "CefrEnglishTarget_coveredByLessonWordId_idx" ON "CefrEnglishTarget"("coveredByLessonWordId");

-- CreateIndex
CREATE UNIQUE INDEX "Lesson_storyId_key" ON "Lesson"("storyId");

-- CreateIndex
CREATE INDEX "Lesson_level_idx" ON "Lesson"("level");

-- CreateIndex
CREATE INDEX "Lesson_type_idx" ON "Lesson"("type");

-- CreateIndex
CREATE UNIQUE INDEX "Lesson_level_lessonOrder_key" ON "Lesson"("level", "lessonOrder");

-- CreateIndex
CREATE INDEX "LessonSection_lessonId_idx" ON "LessonSection"("lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "LessonSection_lessonId_sectionOrder_key" ON "LessonSection"("lessonId", "sectionOrder");

-- CreateIndex
CREATE INDEX "LessonWord_lessonSectionId_idx" ON "LessonWord"("lessonSectionId");

-- CreateIndex
CREATE INDEX "LessonWord_wordId_idx" ON "LessonWord"("wordId");

-- CreateIndex
CREATE INDEX "LessonWord_sentenceId_idx" ON "LessonWord"("sentenceId");

-- CreateIndex
CREATE UNIQUE INDEX "LessonWord_lessonSectionId_itemOrder_key" ON "LessonWord"("lessonSectionId", "itemOrder");

-- CreateIndex
CREATE UNIQUE INDEX "LessonWord_lessonSectionId_wordId_key" ON "LessonWord"("lessonSectionId", "wordId");

-- AddForeignKey
ALTER TABLE "CefrEnglishTarget" ADD CONSTRAINT "CefrEnglishTarget_coveredByLessonWordId_fkey" FOREIGN KEY ("coveredByLessonWordId") REFERENCES "LessonWord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonSection" ADD CONSTRAINT "LessonSection_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonWord" ADD CONSTRAINT "LessonWord_lessonSectionId_fkey" FOREIGN KEY ("lessonSectionId") REFERENCES "LessonSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonWord" ADD CONSTRAINT "LessonWord_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonWord" ADD CONSTRAINT "LessonWord_sentenceId_fkey" FOREIGN KEY ("sentenceId") REFERENCES "ExampleSentence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
