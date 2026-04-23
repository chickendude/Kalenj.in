import type { Prisma, PrismaClient } from '@prisma/client';
import { rewriteLinkLabel } from '$lib/word-links';

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export async function propagateKalenjinRename(
	client: PrismaLike,
	cuid: string,
	newKalenjin: string
): Promise<void> {
	const needle = `/dictionary/${cuid})`;
	const rows = await client.word.findMany({
		where: {
			OR: [{ notes: { contains: needle } }, { translations: { contains: needle } }]
		},
		select: { id: true, notes: true, translations: true }
	});

	for (const row of rows) {
		const nextNotes = row.notes ? rewriteLinkLabel(row.notes, cuid, newKalenjin) : row.notes;
		const nextTranslations = rewriteLinkLabel(row.translations, cuid, newKalenjin);
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
