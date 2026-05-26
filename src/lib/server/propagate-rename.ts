import type { Prisma, PrismaClient } from '@prisma/client';
import { rewriteLinkLabel } from '$lib/word-links';
import { dictionaryEntryHref } from '$lib/word-url';

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export async function propagateKalenjinRename(
	client: PrismaLike,
	cuid: string,
	newKalenjin: string
): Promise<void> {
	const target = await client.word.findUnique({
		where: { id: cuid },
		select: { id: true, kalenjin: true, slug: true }
	});
	const href = target ? dictionaryEntryHref(target) : undefined;
	const needle = `${cuid})`;
	const rows = await client.word.findMany({
		where: {
			OR: [{ notes: { contains: needle } }, { translations: { contains: needle } }]
		},
		select: { id: true, notes: true, translations: true }
	});

	for (const row of rows) {
		const nextNotes = row.notes ? rewriteLinkLabel(row.notes, cuid, newKalenjin, href) : row.notes;
		const nextTranslations = rewriteLinkLabel(row.translations, cuid, newKalenjin, href);
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
