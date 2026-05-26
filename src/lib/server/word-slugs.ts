import type { Prisma, PrismaClient } from '@prisma/client';
import { slugifyWordName } from '$lib/word-url';

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export async function generateUniqueWordSlug(
	client: PrismaLike,
	kalenjin: string,
	excludeWordId?: string | null
): Promise<string> {
	const baseSlug = slugifyWordName(kalenjin);
	const existing = await client.word.findMany({
		where: {
			slug: { startsWith: baseSlug },
			...(excludeWordId ? { id: { not: excludeWordId } } : {})
		},
		select: { slug: true }
	});
	const used = new Set(existing.map((word) => word.slug));

	let suffix = 0;
	let candidate = baseSlug;
	while (used.has(candidate)) {
		suffix += 1;
		candidate = `${baseSlug}-${suffix}`;
	}

	return candidate;
}
