import { PartOfSpeech } from '@prisma/client';

export const PARTS_OF_SPEECH = Object.values(PartOfSpeech);

export function isPartOfSpeech(value: string): value is PartOfSpeech {
	return PARTS_OF_SPEECH.includes(value as PartOfSpeech);
}
