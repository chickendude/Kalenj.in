import { Prisma, type PrismaClient } from '@prisma/client';

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export function slugifyLessonTitle(title: string): string {
	const slug = title
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.replace(/-{2,}/g, '-');

	return slug || 'lesson';
}

/**
 * Slug generation for lessons, mirroring generateUniqueWordSlug: advisory
 * lock on the base slug, then the first free `base`, `base-1`, `base-2`, ...
 */
export async function generateUniqueLessonSlug(
	client: PrismaLike,
	title: string,
	excludeLessonId?: string | null
): Promise<string> {
	const baseSlug = slugifyLessonTitle(title);
	await client.$executeRaw(
		Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`lesson-slug:${baseSlug}`})::bigint)`
	);
	const existing = await client.lesson.findMany({
		where: {
			OR: [{ slug: baseSlug }, { slug: { startsWith: `${baseSlug}-` } }],
			...(excludeLessonId ? { id: { not: excludeLessonId } } : {})
		},
		select: { slug: true }
	});
	const suffixPattern = new RegExp(
		`^${baseSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:-\\d+)?$`
	);
	const used = new Set(
		existing.map((lesson) => lesson.slug).filter((slug) => suffixPattern.test(slug))
	);

	let suffix = 0;
	let candidate = baseSlug;
	while (used.has(candidate)) {
		suffix += 1;
		candidate = `${baseSlug}-${suffix}`;
	}

	return candidate;
}
