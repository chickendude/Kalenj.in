import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';

type PrismaLike = PrismaClient | Prisma.TransactionClient;

/**
 * Lesson slugs are systematic, not title-based (titles aren't unique):
 * vocabulary lessons are `lesson-1`, `lesson-2`, … and story lessons
 * `story-1`, `story-2`, …, each numbered by course position (level, then
 * lessonOrder, drafts included so publishing doesn't renumber anything).
 *
 * Because the numbers depend on position, callers must re-sync after any
 * structural change — creating, deleting, reordering, or re-typing a lesson —
 * inside the same transaction.
 */
export async function syncLessonSlugs(client: PrismaLike): Promise<void> {
	const lessons = await client.lesson.findMany({
		orderBy: [{ level: 'asc' }, { lessonOrder: 'asc' }],
		select: { id: true, type: true, slug: true }
	});

	let lessonCount = 0;
	let storyCount = 0;
	const changed: Array<{ id: string; slug: string }> = [];
	for (const lesson of lessons) {
		const slug =
			lesson.type === 'STORY' ? `story-${++storyCount}` : `lesson-${++lessonCount}`;
		if (slug !== lesson.slug) changed.push({ id: lesson.id, slug });
	}
	if (changed.length === 0) return;

	// Two phases so renumbering can't trip the unique index mid-shift.
	for (const entry of changed) {
		await client.lesson.update({
			where: { id: entry.id },
			data: { slug: `tmp-${entry.id}` }
		});
	}
	for (const entry of changed) {
		await client.lesson.update({ where: { id: entry.id }, data: { slug: entry.slug } });
	}
}

/** Unique throwaway slug for a freshly created lesson, replaced by the sync. */
export function placeholderLessonSlug(): string {
	return `pending-${randomUUID()}`;
}
