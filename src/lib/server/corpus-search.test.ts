import { describe, expect, it, vi } from 'vitest';
import {
	buildCorpusSentenceSearchWhere,
	findKalenjinCorpusSentenceIds,
	parseCorpusSearchLanguage
} from './corpus-search';

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
	it('looks up matching sentence ids with an apostrophe-aware SQL regex', async () => {
		const prisma = {
			$queryRaw: vi.fn().mockResolvedValue([{ id: 'sentence-1' }])
		};

		await expect(findKalenjinCorpusSentenceIds(prisma, 'koita', 100)).resolves.toEqual([
			'sentence-1'
		]);

		const query = prisma.$queryRaw.mock.calls[0][0];
		expect(query.values).toContain("k['\u2019\u2018`\u00b4]?o['\u2019\u2018`\u00b4]?i['\u2019\u2018`\u00b4]?t['\u2019\u2018`\u00b4]?a");
	});
});
