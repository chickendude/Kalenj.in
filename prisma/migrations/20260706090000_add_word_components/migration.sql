CREATE TABLE "WordComponent" (
  "id" TEXT NOT NULL,
  "compoundWordId" TEXT NOT NULL,
  "componentWordId" TEXT NOT NULL,
  "componentOrder" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WordComponent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WordComponent_compoundWordId_componentOrder_key"
ON "WordComponent"("compoundWordId", "componentOrder");

CREATE INDEX "WordComponent_componentWordId_idx"
ON "WordComponent"("componentWordId");

ALTER TABLE "WordComponent"
ADD CONSTRAINT "WordComponent_compoundWordId_fkey"
FOREIGN KEY ("compoundWordId") REFERENCES "Word"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WordComponent"
ADD CONSTRAINT "WordComponent_componentWordId_fkey"
FOREIGN KEY ("componentWordId") REFERENCES "Word"("id") ON DELETE CASCADE ON UPDATE CASCADE;
