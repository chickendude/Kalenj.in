import { describe, expect, it, vi } from 'vitest';
import {
	buildCorpusSentenceSearchWhere,
	findKalenjinCorpusSentenceIds,
	parseCorpusSearchLanguage
} from './corpus-search';
import { matchesEquivalentSearch } from './kalenjin-equivalence';

describe('parseCorpusSearchLanguage', () => {
	it('defaults to Kalenjin search', () => {
		expect(parseCorpusSearchLanguage(null)).toBe('kalenjin');
		expect(parseCorpusSearchLanguage('bogus')).toBe('kalenjin');
	});
});

describe('buildCorpusSentenceSearchWhere', () => {
	it('uses apostrophe-aware Kalenjin ids for Kalenjin searches', () => {
		expect(buildCorpusSentenceSearchWhere('koita', 'kalenjin', ['sentence-1'])).toEqual({
			id: { in: ['sentence-1'] }
		});
	});

	it('keeps English searches literal', () => {
		expect(buildCorpusSentenceSearchWhere('cant', 'english', ['sentence-1'])).toEqual({
			english: { contains: 'cant', mode: 'insensitive' }
		});
	});

	it('combines Kalenjin ids with literal English search for both-language searches', () => {
		expect(buildCorpusSentenceSearchWhere('koita', 'both', ['sentence-1'])).toEqual({
			OR: [
				{ id: { in: ['sentence-1'] } },
				{ english: { contains: 'koita', mode: 'insensitive' } }
			]
		});
	});
});

describe('findKalenjinCorpusSentenceIds', () => {
	it('returns no ids when the query normalizes to empty', async () => {
		const prisma = {
			$queryRaw: vi.fn().mockResolvedValue([{ id: 'sentence-1' }])
		};

		await expect(findKalenjinCorpusSentenceIds(prisma, '   ', 100)).resolves.toEqual([]);
		expect(prisma.$queryRaw).not.toHaveBeenCalled();
	});

	it('looks up sentence ids with an equivalence-aware SQL regex', async () => {
		const prisma = {
			$queryRaw: vi.fn().mockResolvedValue([{ id: 'sentence-1' }])
		};

		await expect(findKalenjinCorpusSentenceIds(prisma, 'koita', 100)).resolves.toEqual([
			'sentence-1'
		]);

		const pattern = prisma.$queryRaw.mock.calls[0][0].values[0] as string;

		// Lowercased + equivalence: k/g, a/o, doubled-vowel quantifiers, optional apostrophes.
		expect(pattern).toBe(
			"[kg]['\u2019\u2018`\u00b4]?[ao]{1,2}['\u2019\u2018`\u00b4]?i{1,2}['\u2019\u2018`\u00b4]?t['\u2019\u2018`\u00b4]?[ao]{1,2}"
		);

		// The same regex matches all the orthographic variants of the query.
		const regex = new RegExp(pattern, 'i');
		expect(regex.test('koita')).toBe(true);
		expect(regex.test("koit'a")).toBe(true);
		expect(regex.test('goita')).toBe(true);
		expect(regex.test('kooita')).toBe(true);
		expect(regex.test('kaita')).toBe(true);
	});

	it('emits a si/sy/sh-equivalent regex for queries like kanetisyet', async () => {
		const prisma = {
			$queryRaw: vi.fn().mockResolvedValue([])
		};

		await findKalenjinCorpusSentenceIds(prisma, 'kanetisyet', 100);
		const pattern = prisma.$queryRaw.mock.calls[0][0].values[0] as string;
		const regex = new RegExp(pattern, 'i');

		expect(regex.test('kanetisyet')).toBe(true);
		expect(regex.test('kanetisiet')).toBe(true);
		expect(regex.test('kanetishet')).toBe(true);
	});

	it('lowercases the query so the equivalence rules fire on mixed-case input', async () => {
		const prisma = {
			$queryRaw: vi.fn().mockResolvedValue([])
		};

		await findKalenjinCorpusSentenceIds(prisma, 'Keer', 100);
		const pattern = prisma.$queryRaw.mock.calls[0][0].values[0] as string;
		const regex = new RegExp(pattern, 'i');

		expect(regex.test('keer')).toBe(true);
		expect(regex.test('ker')).toBe(true);
	});

	it('matches a query ending in p/b against sentence-final punctuation', async () => {
		// Regression: "ochob" should match "Omoche ochob." even though the b is
		// followed by a period rather than whitespace or end-of-string.
		const prisma = {
			$queryRaw: vi.fn().mockResolvedValue([])
		};

		await findKalenjinCorpusSentenceIds(prisma, 'ochob', 100);
		const pattern = prisma.$queryRaw.mock.calls[0][0].values[0] as string;

		// SQL pattern uses a POSIX character class that Postgres understands but
		// JS RegExp does not, so assert the substring rather than running it.
		expect(pattern).toContain('[pb]($|[^[:alpha:]])');

		// JS-side equivalence search (used outside the database) accepts the
		// same range of trailing characters via a non-letter lookahead.
		expect(matchesEquivalentSearch('Omoche ochob.', 'ochob', 'contains')).toBe(true);
		expect(matchesEquivalentSearch('Omoche ochob,', 'ochob', 'contains')).toBe(true);
		expect(matchesEquivalentSearch('Omoche ochob', 'ochob', 'contains')).toBe(true);
		expect(matchesEquivalentSearch('Omoche ochob ', 'ochob', 'contains')).toBe(true);
		// Still shouldn't match a longer word that merely contains "ochob".
		expect(matchesEquivalentSearch('Omoche ochobi.', 'ochob', 'contains')).toBe(false);
	});
});
