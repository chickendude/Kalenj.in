export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const;
export const LESSON_TYPES = ['VOCABULARY', 'STORY'] as const;
export const VOCABULARY_LESSON_TYPES = ['GRAMMAR', 'VOCAB', 'EXPRESSION'] as const;
export const PUBLISH_STATUSES = ['DRAFT', 'PUBLISHED'] as const;

export type CefrLevelValue = (typeof CEFR_LEVELS)[number];
export type LessonTypeValue = (typeof LESSON_TYPES)[number];
export type VocabularyLessonTypeValue = (typeof VOCABULARY_LESSON_TYPES)[number];
export type PublishStatusValue = (typeof PUBLISH_STATUSES)[number];
export type LessonInsertPosition = 'before' | 'after';

export function isCefrLevel(value: string): value is CefrLevelValue {
	return CEFR_LEVELS.includes(value as CefrLevelValue);
}

export function isLessonType(value: string): value is LessonTypeValue {
	return LESSON_TYPES.includes(value as LessonTypeValue);
}

export function isVocabularyLessonType(value: string): value is VocabularyLessonTypeValue {
	return VOCABULARY_LESSON_TYPES.includes(value as VocabularyLessonTypeValue);
}

export function isPublishStatus(value: string): value is PublishStatusValue {
	return PUBLISH_STATUSES.includes(value as PublishStatusValue);
}

export function formatLessonType(value: LessonTypeValue): string {
	return value === 'VOCABULARY' ? 'Vocabulary' : 'Story';
}

export function formatVocabularyLessonType(value: VocabularyLessonTypeValue): string {
	switch (value) {
		case 'GRAMMAR':
			return 'Grammar';
		case 'VOCAB':
			return 'Vocabulary';
		case 'EXPRESSION':
			return 'Expression';
	}
}

export function formatPublishStatus(value: PublishStatusValue): string {
	return value === 'PUBLISHED' ? 'Published' : 'Draft';
}

export function getNextLessonOrder(lessonOrders: number[]): number {
	if (lessonOrders.length === 0) {
		return 1;
	}

	return Math.max(...lessonOrders) + 1;
}

export function getInsertedLessonOrder(
	anchorLessonOrder: number,
	position: LessonInsertPosition
): number {
	return position === 'before' ? anchorLessonOrder : anchorLessonOrder + 1;
}
