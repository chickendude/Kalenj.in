-- CreateTable
CREATE TABLE "IgnoredWordForm" (
    "normalizedForm" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IgnoredWordForm_pkey" PRIMARY KEY ("normalizedForm")
);
