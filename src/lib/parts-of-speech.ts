import type { PartOfSpeech } from '@prisma/client';

export const PARTS_OF_SPEECH = [
	'NOUN',
	'VERB',
	'ADJECTIVE',
	'ADVERB',
	'PRONOUN',
	'PREPOSITION',
	'CONJUNCTION',
	'INTERJECTION',
	'PHRASE',
	'OTHER'
] as const satisfies readonly PartOfSpeech[];

export function isPartOfSpeech(value: string): value is PartOfSpeech {
	return (PARTS_OF_SPEECH as readonly string[]).includes(value);
}
