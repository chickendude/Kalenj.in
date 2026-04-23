import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

async function main() {
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) {
		console.error('DATABASE_URL must be set.');
		process.exit(1);
	}

	const pool = new Pool({ connectionString });
	const adapter = new PrismaPg(pool);
	const prisma = new PrismaClient({ adapter });

	try {
		const result = await prisma.$executeRaw`
			WITH observed AS (
				SELECT "normalizedForm", "wordId", "createdAt", "updatedAt"
				FROM "ExampleSentenceToken"
				WHERE "wordId" IS NOT NULL AND "normalizedForm" <> ''
				UNION ALL
				SELECT "normalizedForm", "wordId", "createdAt", "updatedAt"
				FROM "StorySentenceToken"
				WHERE "wordId" IS NOT NULL AND "normalizedForm" <> ''
				UNION ALL
				SELECT "normalizedForm", "wordId", "createdAt", "updatedAt"
				FROM "ExampleSentenceTokenSegment"
				WHERE "wordId" IS NOT NULL AND "normalizedForm" <> ''
				UNION ALL
				SELECT "normalizedForm", "wordId", "createdAt", "updatedAt"
				FROM "StorySentenceTokenSegment"
				WHERE "wordId" IS NOT NULL AND "normalizedForm" <> ''
			),
			grouped AS (
				SELECT
					observed."normalizedForm",
					observed."wordId",
					COUNT(*)::INTEGER AS "usageCount",
					MIN(observed."createdAt") AS "firstSeenAt",
					MAX(observed."updatedAt") AS "lastSeenAt",
					MIN(observed."createdAt") AS "createdAt",
					CURRENT_TIMESTAMP AS "updatedAt"
				FROM observed
				GROUP BY observed."normalizedForm", observed."wordId"
			)
			INSERT INTO "ObservedWordForm" (
				"normalizedForm",
				"wordId",
				"usageCount",
				"firstSeenAt",
				"lastSeenAt",
				"createdAt",
				"updatedAt"
			)
			SELECT
				grouped."normalizedForm",
				grouped."wordId",
				grouped."usageCount",
				grouped."firstSeenAt",
				grouped."lastSeenAt",
				grouped."createdAt",
				grouped."updatedAt"
			FROM grouped
			ON CONFLICT ("normalizedForm", "wordId")
			DO UPDATE SET
				"usageCount" = EXCLUDED."usageCount",
				"firstSeenAt" = EXCLUDED."firstSeenAt",
				"lastSeenAt" = EXCLUDED."lastSeenAt",
				"updatedAt" = EXCLUDED."updatedAt"
		`;

		console.log(`Observed word forms backfilled: ${result}`);
	} finally {
		await prisma.$disconnect();
		await pool.end();
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
