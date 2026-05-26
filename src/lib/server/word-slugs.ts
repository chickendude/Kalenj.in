import { Prisma, type PrismaClient } from '@prisma/client';
import { slugifyWordName } from '$lib/word-url';

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export async function generateUniqueWordSlug(
	client: PrismaLike,
	kalenjin: string,
	excludeWordId?: string | null
): Promise<string> {
	const baseSlug = slugifyWordName(kalenjin);
	await client.$executeRaw(
		Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`word-slug:${baseSlug}`})::bigint)`
	);
	const existing = await client.word.findMany({
		where: {
			OR: [{ slug: baseSlug }, { slug: { startsWith: `${baseSlug}-` } }],
			...(excludeWordId ? { id: { not: excludeWordId } } : {})
		},
		select: { slug: true }
	});
	const suffixPattern = new RegExp(`^${baseSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:-\\d+)?$`);
	const used = new Set(existing.map((word) => word.slug).filter((slug) => suffixPattern.test(slug)));

	let suffix = 0;
	let candidate = baseSlug;
	while (used.has(candidate)) {
		suffix += 1;
		candidate = `${baseSlug}-${suffix}`;
	}

	return candidate;
}
