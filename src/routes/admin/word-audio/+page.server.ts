import type { PartOfSpeech, Prisma } from '@prisma/client';
import { isPartOfSpeech } from '$lib/parts-of-speech';
import { prisma } from '$lib/server/prisma';
import { requireEditor } from '$lib/server/guards';
import { searchWordsByKalenjin } from '$lib/server/kalenjin-word-search';
import { filterByPartOfSpeech } from '$lib/server/word-filters';
import type { PageServerLoad } from './$types';

const FETCH_LIMIT = 50;
const SEARCH_LIMIT = 200;

type WordRow = {
	id: string;
	kalenjin: string;
	slug: string;
	translations: string;
	partOfSpeech: PartOfSpeech | null;
	pluralForm: string | null;
	isPluralOnly: boolean;
	isSingularOnly: boolean;
	audioUrl: string | null;
	pluralAudioUrl: string | null;
};

export type RecordingTarget = {
	id: string;
	targetId: string;
	targetType: 'word' | 'word-plural';
	primary: string;
	secondary: string;
	wordKalenjin: string;
	wordSlug: string;
	kind: 'singular' | 'plural';
};

function pluralEligible(word: {
	partOfSpeech: PartOfSpeech | null;
	isPluralOnly: boolean;
	isSingularOnly: boolean;
}): boolean {
	return (
		(word.partOfSpeech === 'NOUN' || word.partOfSpeech === 'ADJECTIVE') &&
		!word.isPluralOnly &&
		!word.isSingularOnly
	);
}

function buildTargets(words: WordRow[]): RecordingTarget[] {
	const targets: RecordingTarget[] = [];
	for (const word of words) {
		if (!word.audioUrl) {
			targets.push({
				id: word.id,
				targetId: word.id,
				targetType: 'word',
				primary: word.kalenjin,
				secondary: word.translations,
				wordKalenjin: word.kalenjin,
				wordSlug: word.slug,
				kind: 'singular'
			});
		}
		if (pluralEligible(word) && word.pluralForm && !word.pluralAudioUrl) {
			targets.push({
				id: `${word.id}:plural`,
				targetId: word.id,
				targetType: 'word-plural',
				primary: word.pluralForm,
				secondary: `plural of ${word.kalenjin} — ${word.translations}`,
				wordKalenjin: word.kalenjin,
				wordSlug: word.slug,
				kind: 'plural'
			});
		}
	}
	return targets;
}

function missingAudioWhere(): Prisma.WordWhereInput {
	return {
		OR: [
			{ audioUrl: null },
			{
				partOfSpeech: { in: ['NOUN', 'ADJECTIVE'] },
				isPluralOnly: false,
				isSingularOnly: false,
				pluralForm: { not: null },
				pluralAudioUrl: null
			}
		]
	};
}

export const load: PageServerLoad = async ({ locals, url }) => {
	requireEditor(locals);

	const posParam = url.searchParams.get('pos') ?? '';
	const pos: PartOfSpeech | null = isPartOfSpeech(posParam) ? posParam : null;
	const query = (url.searchParams.get('q') ?? '').trim();

	const posWhere: Prisma.WordWhereInput | null = pos ? { partOfSpeech: pos } : null;
	const filterAndClauses: Prisma.WordWhereInput[] = [missingAudioWhere()];
	if (posWhere) filterAndClauses.push(posWhere);
	const filterWhere: Prisma.WordWhereInput = { AND: filterAndClauses };

	const singularMissingWhere: Prisma.WordWhereInput = posWhere
		? { AND: [{ audioUrl: null }, posWhere] }
		: { audioUrl: null };
	const pluralMissingWhereBase: Prisma.WordWhereInput = {
		partOfSpeech: pos ?? { in: ['NOUN', 'ADJECTIVE'] },
		isPluralOnly: false,
		isSingularOnly: false,
		pluralForm: { not: null },
		pluralAudioUrl: null
	};
	const pluralEligibleByFilter = !pos || pos === 'NOUN' || pos === 'ADJECTIVE';

	let words: WordRow[];
	let totalTargets: number;

	if (query) {
		const searched = await searchWordsByKalenjin(prisma, query, SEARCH_LIMIT);
		const scoped = searched.filter(
			(w) =>
				!w.audioUrl ||
				(pluralEligible(w) && w.pluralForm && !w.pluralAudioUrl)
		);
		const posFiltered = filterByPartOfSpeech(scoped, pos);
		words = posFiltered.map((w) => ({
			id: w.id,
			kalenjin: w.kalenjin,
			slug: w.slug ?? w.id,
			translations: w.translations,
			partOfSpeech: w.partOfSpeech,
			pluralForm: w.pluralForm,
			isPluralOnly: w.isPluralOnly,
			isSingularOnly: w.isSingularOnly,
			audioUrl: w.audioUrl,
			pluralAudioUrl: w.pluralAudioUrl
		}));
		const targetsForCount = buildTargets(words);
		totalTargets = targetsForCount.length;
	} else {
		const [singularMissingCount, pluralMissingCount, rows] = await Promise.all([
			prisma.word.count({ where: singularMissingWhere }),
			pluralEligibleByFilter
				? prisma.word.count({ where: pluralMissingWhereBase })
				: Promise.resolve(0),
			prisma.word.findMany({
				where: filterWhere,
				orderBy: [{ kalenjin: 'asc' }],
				take: FETCH_LIMIT,
				select: {
					id: true,
					kalenjin: true,
					slug: true,
					translations: true,
					partOfSpeech: true,
					pluralForm: true,
					isPluralOnly: true,
					isSingularOnly: true,
					audioUrl: true,
					pluralAudioUrl: true
				}
			})
		]);
		totalTargets = singularMissingCount + pluralMissingCount;
		words = rows;
	}

	const targets = buildTargets(words);

	return {
		targets,
		totalTargets,
		fetchLimit: FETCH_LIMIT,
		pos: posParam,
		q: query
	};
};
