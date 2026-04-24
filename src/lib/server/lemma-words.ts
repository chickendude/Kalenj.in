import { Prisma, type PartOfSpeech } from '@prisma/client';
import { prepareAlternativeSpellings, preparePluralForms } from './kalenjin-word-search';
import { normalizeLemma } from './normalize-lemma';

export const PRESENT_TENSE_KEYS = [
	'presentAnee',
	'presentInyee',
	'presentInee',
	'presentEchek',
	'presentOkwek',
	'presentIchek'
] as const;

export type PresentTenseKey = (typeof PRESENT_TENSE_KEYS)[number];

export type PresentTenseConjugations = Record<PresentTenseKey, string | null>;

const EMPTY_PRESENT_TENSE: PresentTenseConjugations = {
	presentAnee: null,
	presentInyee: null,
	presentInee: null,
	presentEchek: null,
	presentOkwek: null,
	presentIchek: null
};

export function buildWordSelect() {
	return {
		id: true,
		kalenjin: true,
		translations: true,
		notes: true,
		partOfSpeech: true,
		pluralForm: true,
		isPluralOnly: true,
		presentAnee: true,
		presentInyee: true,
		presentInee: true,
		presentEchek: true,
		presentOkwek: true,
		presentIchek: true,
		imageUrl: true,
		spellings: {
			orderBy: [{ spelling: 'asc' as const }],
			select: {
				id: true,
				spelling: true,
				spellingNormalized: true
			}
		}
	};
}

export type LemmaWordInput = {
	wordId?: string | null;
	kalenjin: string;
	translations: string;
	notes?: string | null;
	alternativeSpellings?: string | null;
	partOfSpeech?: PartOfSpeech | null;
	pluralForm?: string | null;
	isPluralOnly?: boolean;
	presentTense?: PresentTenseConjugations | null;
	/** `undefined` leaves the image untouched, a string sets a new URL, `null` clears it. */
	imageUrl?: string | null;
};

export function readPresentTenseFromFormData(formData: FormData): PresentTenseConjugations {
	const read = (key: PresentTenseKey): string | null => {
		const raw = String(formData.get(key) ?? '').trim();
		return raw.length > 0 ? raw : null;
	};

	return {
		presentAnee: read('presentAnee'),
		presentInyee: read('presentInyee'),
		presentInee: read('presentInee'),
		presentEchek: read('presentEchek'),
		presentOkwek: read('presentOkwek'),
		presentIchek: read('presentIchek')
	};
}

export async function createOrUpdateLinkedWord(
	tx: Prisma.TransactionClient,
	input: LemmaWordInput
) {
	const spellings = prepareAlternativeSpellings(input.alternativeSpellings ?? '', input.kalenjin);
	const canHavePlural =
		input.partOfSpeech === 'NOUN' || input.partOfSpeech === 'ADJECTIVE';
	const isPluralOnlyProvided = input.isPluralOnly !== undefined;
	const isPluralOnly = canHavePlural && input.isPluralOnly === true;
	const rawPluralForm = canHavePlural && !isPluralOnly ? input.pluralForm ?? null : null;
	const { pluralForm, pluralFormNormalized } = rawPluralForm
		? preparePluralForms(rawPluralForm)
		: { pluralForm: null, pluralFormNormalized: null };
	const presentTense: PresentTenseConjugations =
		input.partOfSpeech === 'VERB' && input.presentTense
			? input.presentTense
			: EMPTY_PRESENT_TENSE;
	const isPluralOnlyPatch = isPluralOnlyProvided || !canHavePlural
		? { isPluralOnly }
		: {};

	if (input.wordId) {
		return tx.word.update({
			where: { id: input.wordId },
			data: {
				kalenjin: input.kalenjin,
				kalenjinNormalized: normalizeLemma(input.kalenjin),
				translations: input.translations,
				notes: input.notes ?? null,
				partOfSpeech: input.partOfSpeech ?? null,
				pluralForm,
				pluralFormNormalized,
				...isPluralOnlyPatch,
				...presentTense,
				...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
				spellings: {
					deleteMany: {},
					createMany: spellings.length ? { data: spellings } : undefined
				}
			},
			select: buildWordSelect()
		});
	}

	return tx.word.create({
		data: {
			kalenjin: input.kalenjin,
			kalenjinNormalized: normalizeLemma(input.kalenjin),
			translations: input.translations,
			notes: input.notes ?? null,
			partOfSpeech: input.partOfSpeech ?? null,
			pluralForm,
			pluralFormNormalized,
			isPluralOnly,
			...presentTense,
			imageUrl: input.imageUrl ?? null,
			spellings: spellings.length ? { createMany: { data: spellings } } : undefined
		},
		select: buildWordSelect()
	});
}
