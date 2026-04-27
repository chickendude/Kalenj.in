import { describe, expect, it, vi } from 'vitest';
import {
	normalizeKalenjinSearchQuery,
	parseCommaSeparatedForms,
	prepareAlternativeSpellings,
	preparePluralForms,
	scoreKalenjinWordMatch,
	sortKalenjinSearchResults,
	searchWordsByKalenjin
} from './kalenjin-word-search';
import type { KalenjinSearchWord } from './kalenjin-word-search';

const WORDS: KalenjinSearchWord[] = [
	{
		id: '1',
		kalenjin: 'chamcham',
		kalenjinNormalized: 'chamcham',
		translations: 'taste',
		partOfSpeech: null,
		notes: null,
		pluralForm: null,
		pluralFormNormalized: null,
		isPluralOnly: false,
		presentAnee: null,
		presentInyee: null,
		presentInee: null,
		presentEchek: null,
		presentOkwek: null,
		presentIchek: null,
		imageUrl: null,
		audioUrl: null,
		createdAt: new Date('2026-01-01T00:00:00.000Z'),
		updatedAt: new Date('2026-01-01T00:00:00.000Z'),
		spellings: []
	},
	{
		id: '2',
		kalenjin: 'missing',
		kalenjinNormalized: 'missing',
		translations: 'hello',
		partOfSpeech: null,
		notes: null,
		pluralForm: null,
		pluralFormNormalized: null,
		isPluralOnly: false,
		presentAnee: null,
		presentInyee: null,
		presentInee: null,
		presentEchek: null,
		presentOkwek: null,
		presentIchek: null,
		imageUrl: null,
		audioUrl: null,
		createdAt: new Date('2026-01-01T00:00:00.000Z'),
		updatedAt: new Date('2026-01-01T00:00:00.000Z'),
		spellings: [{ spelling: 'misseng', spellingNormalized: 'misseng' }]
	},
	{
		id: '3',
		kalenjin: 'kot',
		kalenjinNormalized: 'kot',
		translations: 'house',
		partOfSpeech: null,
		notes: null,
		pluralForm: null,
		pluralFormNormalized: null,
		isPluralOnly: false,
		presentAnee: null,
		presentInyee: null,
		presentInee: null,
		presentEchek: null,
		presentOkwek: null,
		presentIchek: null,
		imageUrl: null,
		audioUrl: null,
		createdAt: new Date('2026-01-01T00:00:00.000Z'),
		updatedAt: new Date('2026-01-01T00:00:00.000Z'),
		spellings: [{ spelling: 'koot', spellingNormalized: 'koot' }]
	}
];

function makeSearchWord(overrides: Partial<KalenjinSearchWord> = {}): KalenjinSearchWord {
	return {
		...WORDS[0],
		...overrides,
		spellings: overrides.spellings ?? []
	};
}

describe('normalizeKalenjinSearchQuery', () => {
	it('strips punctuation and lowercases while keeping apostrophes', () => {
		expect(normalizeKalenjinSearchQuery('"Koit\'a?!"')).toBe("koit'a");
	});
});

describe('parseCommaSeparatedForms', () => {
	it('parses comma or newline separated forms and deduplicates by normalized form', () => {
		expect(parseCommaSeparatedForms('  misseng,\n\nkoot, Misseng\n')).toEqual([
			'misseng',
			'koot'
		]);
	});
});

describe('prepareAlternativeSpellings', () => {
	it('removes spellings that duplicate the base lemma', () => {
		expect(prepareAlternativeSpellings('chamcham\nchomchom\n', 'chamcham')).toEqual([
			{ spelling: 'chomchom', spellingNormalized: 'chomchom' }
		]);
	});
});

describe('preparePluralForms', () => {
	it('stores plural forms as a canonical comma-separated list', () => {
		expect(preparePluralForms('  kotiosiek, kotiosiekab  , Kotiosiek ')).toEqual({
			pluralForm: 'kotiosiek, kotiosiekab',
			pluralFormNormalized: 'kotiosiek, kotiosiekab'
		});
	});
});

describe('scoreKalenjinWordMatch', () => {
	it('treats apostrophes as optional only when the query omits them', () => {
		const withApostrophe = makeSearchWord({
			id: '4',
			kalenjin: "koit'a",
			kalenjinNormalized: "koit'a",
			translations: 'stone'
		});
		const withoutApostrophe = makeSearchWord({
			id: '5',
			kalenjin: 'koita',
			kalenjinNormalized: 'koita',
			translations: 'stone'
		});

		expect(scoreKalenjinWordMatch(withApostrophe, 'koita')).toBe(2);
		expect(scoreKalenjinWordMatch(withApostrophe, "koit'a")).toBe(0);
		expect(scoreKalenjinWordMatch(withoutApostrophe, "koit'a")).toBe(Number.POSITIVE_INFINITY);
	});

	it('treats a/o as equivalent for base lemma matching', () => {
		expect(scoreKalenjinWordMatch(WORDS[0], 'chomchom')).toBe(2);
		expect(scoreKalenjinWordMatch(WORDS[0], 'chamcham')).toBe(0);
	});

	it('treats k/g as equivalent for base lemma matching', () => {
		expect(scoreKalenjinWordMatch(WORDS[2], 'got')).toBe(2);
		expect(scoreKalenjinWordMatch(WORDS[2], 'kot')).toBe(0);
	});

	it('treats word-final p/b as equivalent for base lemma matching', () => {
		const word = makeSearchWord({
			id: '4',
			kalenjin: 'chitap',
			kalenjinNormalized: 'chitap',
			translations: 'person of'
		});

		expect(scoreKalenjinWordMatch(word, 'chitab')).toBe(2);
		expect(scoreKalenjinWordMatch(word, 'chitap')).toBe(0);
	});

	it('does not treat internal p/b as equivalent', () => {
		const word = makeSearchWord({
			id: '5',
			kalenjin: 'kaplel',
			kalenjinNormalized: 'kaplel',
			translations: 'white'
		});

		expect(scoreKalenjinWordMatch(word, 'kablel')).toBe(Number.POSITIVE_INFINITY);
	});

	it('matches alternative spellings', () => {
		expect(scoreKalenjinWordMatch(WORDS[1], 'misseng')).toBe(1);
	});

	it('matches prior token surfaces linked to the lemma', () => {
		const word = makeSearchWord({
			id: '4',
			kalenjin: 'am',
			kalenjinNormalized: 'am',
			translations: 'eat',
			observedForms: [{ normalizedForm: 'aame', usageCount: 1 }]
		});

		expect(scoreKalenjinWordMatch(word, 'aame')).toBe(1.5);
	});

	it('uses observed form frequency to break ties', () => {
		const occasional = makeSearchWord({
			id: '4',
			kalenjin: 'am',
			kalenjinNormalized: 'am',
			translations: 'eat',
			observedForms: [{ normalizedForm: 'aame', usageCount: 1 }]
		});
		const frequent = makeSearchWord({
			id: '5',
			kalenjin: 'amun',
			kalenjinNormalized: 'amun',
			translations: 'swallow',
			observedForms: [{ normalizedForm: 'aame', usageCount: 4 }]
		});

		expect(sortKalenjinSearchResults([occasional, frequent], 'aame').map((word) => word.id)).toEqual([
			'5',
			'4'
		]);
	});
});

describe('sortKalenjinSearchResults', () => {
	it('prefers primary exact matches, then alternate spellings, then fuzzy equivalent-letter matches', () => {
		expect(sortKalenjinSearchResults(WORDS, 'kot').map((word) => word.id)).toEqual(['3', '1', '2']);
		expect(sortKalenjinSearchResults(WORDS, 'misseng').map((word) => word.id)).toEqual([
			'2',
			'1',
			'3'
		]);
		expect(sortKalenjinSearchResults(WORDS, 'chomchom').map((word) => word.id)).toEqual([
			'1',
			'2',
			'3'
		]);
		expect(sortKalenjinSearchResults(WORDS, 'got').map((word) => word.id)).toEqual([
			'3',
			'1',
			'2'
		]);
	});
});

describe('scoreKalenjinWordMatch – prefix and contains', () => {
	it('scores a prefix match lower than a contains match', () => {
		const word = WORDS[0]; // chamcham
		const prefixScore = scoreKalenjinWordMatch(word, 'cham');
		const containsScore = scoreKalenjinWordMatch(word, 'mcham');
		expect(prefixScore).toBeLessThan(containsScore);
	});

	it('scores an a/o prefix match lower than an a/o contains match', () => {
		const word = WORDS[0]; // chamcham
		const prefixScore = scoreKalenjinWordMatch(word, 'chom');
		const containsScore = scoreKalenjinWordMatch(word, 'mchom');
		expect(prefixScore).toBeLessThan(containsScore);
	});

	it('returns Infinity for a query that does not match at all', () => {
		expect(scoreKalenjinWordMatch(WORDS[0], 'xyz')).toBe(Number.POSITIVE_INFINITY);
	});

	it('returns Infinity for an empty query', () => {
		expect(scoreKalenjinWordMatch(WORDS[0], '')).toBe(Number.POSITIVE_INFINITY);
	});

	it('matches via plural form', () => {
		const wordWithPlural = {
			...WORDS[2],
			pluralForm: 'kotiosiek',
			pluralFormNormalized: 'kotiosiek'
		};
		const score = scoreKalenjinWordMatch(wordWithPlural, 'kotiosiek');
		// Plural exact match gets score 1 (0 + alternateOffset 1)
		expect(score).toBe(1);
	});

	it('matches via alternate plural form in a comma-separated list', () => {
		const wordWithPlural = {
			...WORDS[2],
			pluralForm: 'kotiosiek, kotiosiekab',
			pluralFormNormalized: 'kotiosiek, kotiosiekab'
		};
		const score = scoreKalenjinWordMatch(wordWithPlural, 'kotiosiekab');
		expect(score).toBe(1);
	});
});

describe('searchWordsByKalenjin', () => {
	function makePrisma(candidateIds: string[], words: typeof WORDS) {
		return {
			$queryRaw: vi.fn().mockResolvedValue(candidateIds.map((id) => ({ id }))),
			word: {
				findMany: vi.fn().mockResolvedValue(words)
			}
		};
	}

	it('returns all words ordered alphabetically when query is empty', async () => {
		const allWords = [WORDS[2], WORDS[0], WORDS[1]]; // kot, chamcham, missing
		const prisma = makePrisma([], allWords);

		const result = await searchWordsByKalenjin(prisma, '', 10);

		expect(prisma.$queryRaw).not.toHaveBeenCalled();
		expect(prisma.word.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				orderBy: [{ kalenjin: 'asc' }, { translations: 'asc' }],
				take: 10
			})
		);
		expect(result).toEqual(allWords);
	});

	it('returns empty array when no SQL candidates are found', async () => {
		const prisma = makePrisma([], []);
		prisma.$queryRaw.mockResolvedValue([]);

		const result = await searchWordsByKalenjin(prisma, 'nonexistent', 10);

		expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
		expect(prisma.word.findMany).not.toHaveBeenCalled();
		expect(result).toEqual([]);
	});

	it('fetches candidates by SQL then scores and sorts them in JS', async () => {
		// Simulate SQL returning ids for chamcham and kot
		const prisma = makePrisma(['1', '3'], [WORDS[0], WORDS[2]]);

		const result = await searchWordsByKalenjin(prisma, 'kot', 10);

		expect(prisma.$queryRaw).toHaveBeenCalled();
		expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
		expect(prisma.word.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: { in: ['1', '3'] } }
			})
		);
		// kot (exact match) should come before chamcham
		expect(result.map((w) => w.id)).toEqual(['3', '1']);
	});

	it('falls back to equivalent-letter SQL only when the indexed contains query has no candidates', async () => {
		const prisma = makePrisma([], [WORDS[2]]);
		prisma.$queryRaw
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([{ id: '3', observedNormalizedForm: null, observedUsageCount: null }]);

		const result = await searchWordsByKalenjin(prisma, 'got', 10);

		expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
		expect(result.map((word) => word.id)).toEqual(['3']);
	});

	it('ranks lemmas from prior token links ahead of weaker textual matches', async () => {
		const linkedWord = makeSearchWord({
			id: '4',
			kalenjin: 'am',
			kalenjinNormalized: 'am',
			translations: 'eat'
		});
		const textualMatch = makeSearchWord({
			id: '5',
			kalenjin: 'kaame',
			kalenjinNormalized: 'kaame',
			translations: 'tries'
		});
		const prisma = makePrisma([], [textualMatch, linkedWord]);
		prisma.$queryRaw.mockResolvedValue([
			{ id: '5', observedNormalizedForm: null, observedUsageCount: null },
			{ id: '4', observedNormalizedForm: 'aame', observedUsageCount: 3 }
		]);

		const result = await searchWordsByKalenjin(prisma, 'aame', 10);

		expect(prisma.word.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: { in: ['5', '4'] } }
			})
		);
		expect(result.map((word) => word.id)).toEqual(['4', '5']);
	});

	it('respects the limit parameter on the final results', async () => {
		const prisma = makePrisma(
			['1', '2', '3'],
			[WORDS[0], WORDS[1], WORDS[2]]
		);

		const result = await searchWordsByKalenjin(prisma, 'missing', 1);

		// Only 1 result should be returned despite more candidates
		expect(result).toHaveLength(1);
	});
});
