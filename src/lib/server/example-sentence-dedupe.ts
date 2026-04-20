import type { Prisma, PrismaClient } from '@prisma/client';

type DedupeMatch = {
	id: string;
	lessonWord: {
		id: string;
		kalenjin: string;
		lessonSection: { lesson: { id: string; title: string } };
	} | null;
};

export type PrismaLike = PrismaClient | Prisma.TransactionClient;

export async function findMatchingExampleSentence(
	db: PrismaLike,
	kalenjin: string,
	english: string,
	excludeSentenceId?: string
): Promise<DedupeMatch | null> {
	const sentence = await db.exampleSentence.findFirst({
		where: {
			kalenjin: { equals: kalenjin, mode: 'insensitive' },
			english: { equals: english, mode: 'insensitive' },
			...(excludeSentenceId ? { id: { not: excludeSentenceId } } : {})
		},
		select: {
			id: true,
			lessonWords: {
				take: 1,
				select: {
					id: true,
					kalenjin: true,
					lessonSection: {
						select: {
							lesson: { select: { id: true, title: true } }
						}
					}
				}
			}
		}
	});

	if (!sentence) return null;
	return {
		id: sentence.id,
		lessonWord: sentence.lessonWords[0] ?? null
	};
}

export function formatSentenceInUseError(owner: {
	kalenjin: string;
	lessonSection: { lesson: { title: string } };
}): string {
	return `This sentence is already used by "${owner.kalenjin}" in lesson "${owner.lessonSection.lesson.title}".`;
}
