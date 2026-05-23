import type { Prisma } from '@prisma/client';
import type { SentenceStoryLink } from '$lib/sentence-story-links';

export const sentenceStoryLinkSelect = {
	id: true,
	story: {
		select: {
			title: true,
			lesson: {
				select: {
					id: true,
					lessonOrder: true,
					title: true
				}
			}
		}
	}
} satisfies Prisma.StorySentenceSelect;

type SentenceWithStoryLink = {
	storySentence?: Prisma.StorySentenceGetPayload<{
		select: typeof sentenceStoryLinkSelect;
	}> | null;
};

export function buildSentenceStoryLinks(sentence: SentenceWithStoryLink): SentenceStoryLink[] {
	const storySentence = sentence.storySentence;
	const lesson = storySentence?.story.lesson;

	if (!storySentence || !lesson) {
		return [];
	}

	return [
		{
			id: storySentence.id,
			href: `/lessons/${lesson.id}`,
			lessonNumber: lesson.lessonOrder,
			lessonTitle: lesson.title,
			storyTitle: storySentence.story.title
		}
	];
}
