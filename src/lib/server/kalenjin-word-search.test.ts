import { describe, expect, it, vi } from 'vitest';
import {
	normalizeKalenjinSearchQuery,
	parseAlternativeSpellings,
	prepareAlternativeSpellings,
	scoreKalenjinWordMatch,
	sortKalenjinSearchResults,
	searchWordsByKalenjin
} from './kalenjin-word-search';

const WORDS = [
	{
		id: '1',
		kalenjin: 'chamcham',
		kalenjinNormalized: 'chamcham',
		translations: 'taste',
		partOfSpeech: null,
		notes: null,
		pluralForm: null,
		pluralFormNormalized: null,
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
		createdAt: new Date('2026-01-01T00:00:00.000Z'),
		updatedAt: new Date('2026-01-01T00:00:00.000Z'),
		spellings: [{ spelling: 'koot', spellingNormalized: 'koot' }]
	}
];

describe('normalizeKalenjinSearchQuery', () => {
	it('strips punctuation and lowercases while keeping apostrophes', () => {
		expect(normalizeKalenjinSearchQuery('"Koit\'a?!"')).toBe("koit'a");
	});
});

describe('parseAlternativeSpellings', () => {
	it('parses comma or newline separated spellings and deduplicates by normalized spelling', () => {
		expect(parseAlternativeSpellings('  misseng,\n\nkoot, Misseng\n')).toEqual([
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

describe('scoreKalenjinWordMatch', () => {
	it('treats a/o as equivalent for base lemma matching', () => {
		expect(scoreKalenjinWordMatch(WORDS[0], 'chomchom')).toBe(2);
		expect(scoreKalenjinWordMatch(WORDS[0], 'chamcham')).toBe(0);
	});

	it('matches alternative spellings', () => {
		expect(scoreKalenjinWordMatch(WORDS[1], 'misseng')).toBe(1);
	});
});

describe('sortKalenjinSearchResults', () => {
	it('prefers primary exact matches, then alternate spellings, then fuzzy a/o matches', () => {
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

		expect(prisma.$queryRaw).toHaveBeenCalled();
		expect(prisma.word.findMany).not.toHaveBeenCalled();
		expect(result).toEqual([]);
	});

	it('fetches candidates by SQL then scores and sorts them in JS', async () => {
		// Simulate SQL returning ids for chamcham and kot
		const prisma = makePrisma(['1', '3'], [WORDS[0], WORDS[2]]);

		const result = await searchWordsByKalenjin(prisma, 'kot', 10);

		expect(prisma.$queryRaw).toHaveBeenCalled();
		expect(prisma.word.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: { in: ['1', '3'] } }
			})
		);
		// kot (exact match) should come before chamcham
		expect(result.map((w) => w.id)).toEqual(['3', '1']);
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
