-- CreateTable
CREATE TABLE "ListeningProgram" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "currentDay" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListeningProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListeningProgramLesson" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ListeningProgramLesson_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ListeningProgram_userId_key" ON "ListeningProgram"("userId");

-- CreateIndex
CREATE INDEX "ListeningProgramLesson_lessonId_idx" ON "ListeningProgramLesson"("lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "ListeningProgramLesson_programId_lessonId_key" ON "ListeningProgramLesson"("programId", "lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "ListeningProgramLesson_programId_position_key" ON "ListeningProgramLesson"("programId", "position");

-- AddForeignKey
ALTER TABLE "ListeningProgram" ADD CONSTRAINT "ListeningProgram_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListeningProgramLesson" ADD CONSTRAINT "ListeningProgramLesson_programId_fkey" FOREIGN KEY ("programId") REFERENCES "ListeningProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListeningProgramLesson" ADD CONSTRAINT "ListeningProgramLesson_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
