import type { Prisma, PrismaClient } from '@prisma/client';
import { rewriteLinkLabel } from '$lib/word-links';
import { dictionaryEntryHref } from '$lib/word-url';

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export async function propagateKalenjinRename(
	client: PrismaLike,
	cuid: string,
	newKalenjin: string,
	previousSlug?: string | null
): Promise<void> {
	const target = await client.word.findUnique({
		where: { id: cuid },
		select: { id: true, kalenjin: true, slug: true }
	});
	const href = target ? dictionaryEntryHref(target) : undefined;
	const segments = [cuid, previousSlug, target?.slug].filter(
		(segment): segment is string => Boolean(segment)
	);
	const rows = await client.word.findMany({
		where: {
			OR: segments.flatMap((segment) => [
				{ notes: { contains: `/dictionary/${segment}` } },
				{ translations: { contains: `/dictionary/${segment}` } }
			])
		},
		select: { id: true, notes: true, translations: true }
	});

	for (const row of rows) {
		const nextNotes = row.notes ? rewriteLinkLabel(row.notes, segments, newKalenjin, href) : row.notes;
		const nextTranslations = rewriteLinkLabel(row.translations, segments, newKalenjin, href);
		if (nextNotes === row.notes && nextTranslations === row.translations) continue;
		await client.word.update({
			where: { id: row.id },
			data: {
				notes: nextNotes,
				translations: nextTranslations
			}
		});
	}
}
