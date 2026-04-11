import {
	isCefrLevel,
	isLessonType,
	isPublishStatus,
	isVocabularyLessonType
} from '$lib/course';
import type {
	CefrLevel,
	CourseLessonType,
	PublishStatus,
	VocabularyLessonType
} from '@prisma/client';

export function readText(formData: FormData, key: string): string {
	return String(formData.get(key) ?? '').trim();
}

export function readOptionalText(formData: FormData, key: string): string | null {
	const value = readText(formData, key);
	return value || null;
}

export function readInteger(formData: FormData, key: string): number | null {
	const raw = readText(formData, key);
	if (!raw) {
		return null;
	}

	const value = Number(raw);
	return Number.isInteger(value) ? value : null;
}

export function readStringList(formData: FormData, key: string): string[] {
	return formData
		.getAll(key)
		.map((value) => String(value).trim())
		.filter((value) => value.length > 0);
}

export function parseLineSeparatedEntries(value: string): string[] {
	return Array.from(
		new Set(
			value
				.split(/\r?\n/)
				.map((entry) => entry.trim())
				.filter((entry) => entry.length > 0)
		)
	);
}

export function parsePositiveInteger(value: string | null | undefined, fallback = 1): number {
	const parsed = Number(value);

	if (!Number.isInteger(parsed) || parsed < 1) {
		return fallback;
	}

	return parsed;
}

export function parseCefrLevelValue(value: string): CefrLevel | null {
	return isCefrLevel(value) ? (value as CefrLevel) : null;
}

export function parseLessonTypeValue(value: string): CourseLessonType | null {
	return isLessonType(value) ? (value as CourseLessonType) : null;
}

export function parseVocabularyLessonTypeValue(value: string): VocabularyLessonType | null {
	if (!value) {
		return null;
	}

	return isVocabularyLessonType(value) ? (value as VocabularyLessonType) : null;
}

export function parsePublishStatusValue(value: string): PublishStatus | null {
	return isPublishStatus(value) ? (value as PublishStatus) : null;
}
