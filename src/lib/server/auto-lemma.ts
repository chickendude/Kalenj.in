import type { Prisma, PrismaClient } from '@prisma/client';
import { recordObservedWordForm } from '$lib/server/observed-word-forms';
import { normalizeToken, type TokenizedWord } from '$lib/server/tokenize';

type AutoLemmaDb = Prisma.TransactionClient | PrismaClient;

export type ExistingLemmaAnnotation = {
	tokenOrder: number;
	surfaceForm: string;
	normalizedForm: string;
	wordId: string | null;
	inContextTranslation: string | null;
	word?: {
		kalenjinNormalized: string;
	} | null;
};

type AutoLemmaSegmentPlan = {
	segmentOrder: number;
	segmentStart: number;
	segmentEnd: number;
	surfaceForm: string;
	normalizedForm: string;
	wordId: string | null;
	autoLinked: boolean;
};

export type AutoLemmaTokenPlan = {
	tokenOrder: number;
	surfaceForm: string;
	normalizedForm: string;
	wordId: string | null;
	inContextTranslation: string | null;
	segments: AutoLemmaSegmentPlan[];
	autoLinked: boolean;
};

export type AutoLemmaPlanResult = {
	tokens: AutoLemmaTokenPlan[];
	autoLinkedCount: number;
};

type AutoLemmaTranslationKey = `${string}\u0000${string}`;
type AutoLemmaTranslationPair = [normalizedForm: string, wordId: string];
type AutoLemmaLookupInput = string | { normalizedForm: string; surfaceForm?: string | null };

export type AutoLemmaSegmentPattern = Array<{
	normalizedForm: string;
	wordId: string;
}>;

const COMMON_EDGE_PUNCTUATION = ['.', '?', '!', ',', ';', ':'];

type ExampleSentenceCreateInput = {
	kalenjin: string;
	english: string;
	notes?: string | null;
	tokenData: TokenizedWord[];
};

function distinct(values: string[]): string[] {
	return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function effectiveNormalizedForm(value: string): string {
	return normalizeToken(value);
}

function lookupFormVariants(value: string): string[] {
	const raw = value.trim().toLowerCase();
	const normalized = effectiveNormalizedForm(value);
	if (!normalized) {
		return distinct([raw]);
	}

	return distinct([raw, normalized, ...COMMON_EDGE_PUNCTUATION.map((mark) => `${normalized}${mark}`)]);
}

function lookupInputNormalizedForm(input: AutoLemmaLookupInput): string {
	return typeof input === 'string'
		? effectiveNormalizedForm(input)
		: effectiveNormalizedForm(input.normalizedForm);
}

function lookupInputForms(inputs: AutoLemmaLookupInput[]): string[] {
	return inputs.map(lookupInputNormalizedForm);
}

function lookupInputSurfaceForms(inputs: AutoLemmaLookupInput[]): Array<{
	normalizedForm: string;
	surfaceForm: string;
}> {
	return inputs.flatMap((input) => {
		if (typeof input === 'string') return [];
		const normalizedForm = effectiveNormalizedForm(input.normalizedForm);
		const surfaceForm = input.surfaceForm?.trim();
		if (!normalizedForm || !surfaceForm) return [];
		return [{ normalizedForm, surfaceForm }];
	});
}

function translationKey(normalizedForm: string, wordId: string): AutoLemmaTranslationKey {
	return `${normalizedForm}\u0000${wordId}`;
}

function hasAnnotation(token: ExistingLemmaAnnotation): boolean {
	return Boolean(token.wordId || token.inContextTranslation?.trim());
}

function findPreservedAnnotation(
	incoming: TokenizedWord,
	existingTokens: ExistingLemmaAnnotation[],
	usedIndexes: Set<number>
): Pick<ExistingLemmaAnnotation, 'wordId' | 'inContextTranslation'> | null {
	const incomingNormalized = effectiveNormalizedForm(incoming.normalizedForm);
	const sameOrderIndex = existingTokens.findIndex(
		(existing, index) =>
			!usedIndexes.has(index) &&
			existing.tokenOrder === incoming.tokenOrder &&
			effectiveNormalizedForm(existing.normalizedForm) === incomingNormalized &&
			hasAnnotation(existing)
	);

	if (sameOrderIndex >= 0) {
		usedIndexes.add(sameOrderIndex);
		return existingTokens[sameOrderIndex];
	}

	const sameNormalizedIndex = existingTokens.findIndex(
		(existing, index) =>
			!usedIndexes.has(index) &&
			effectiveNormalizedForm(existing.normalizedForm) === incomingNormalized &&
			hasAnnotation(existing)
	);

	if (sameNormalizedIndex >= 0) {
		usedIndexes.add(sameNormalizedIndex);
		return existingTokens[sameNormalizedIndex];
	}

	const sameLemmaIndex = existingTokens.findIndex(
		(existing, index) =>
			!usedIndexes.has(index) &&
			Boolean(existing.wordId) &&
			effectiveNormalizedForm(existing.word?.kalenjinNormalized ?? '') === incomingNormalized
	);

	if (sameLemmaIndex >= 0) {
		usedIndexes.add(sameLemmaIndex);
		return existingTokens[sameLemmaIndex];
	}

	return null;
}

export function splitMarkedTokenSegments(surfaceForm: string): Array<{
	segmentOrder: number;
	segmentStart: number;
	segmentEnd: number;
	surfaceForm: string;
	normalizedForm: string;
}> {
	if (!surfaceForm.includes('|')) {
		return [];
	}

	const segments: ReturnType<typeof splitMarkedTokenSegments> = [];
	let cursor = 0;
	for (const rawPart of surfaceForm.split('|')) {
		const start = cursor;
		const end = start + rawPart.length;
		const normalizedForm = normalizeToken(rawPart);
		if (rawPart.length > 0 && normalizedForm.length > 0) {
			segments.push({
				segmentOrder: segments.length,
				segmentStart: start,
				segmentEnd: end,
				surfaceForm: rawPart,
				normalizedForm
			});
		}
		cursor = end + 1;
	}

	return segments.length > 1 ? segments : [];
}

function edgePunctuationLengths(surfaceForm: string): { leading: number; trailing: number } {
	return {
		leading: surfaceForm.match(/^[^\p{L}\p{N}]*/u)?.[0].length ?? 0,
		trailing: surfaceForm.match(/[^\p{L}\p{N}]*$/u)?.[0].length ?? 0
	};
}

function inferKnownFusedTokenSegments(
	surfaceForm: string,
	normalizedForm: string,
	pattern: AutoLemmaSegmentPattern | undefined
): AutoLemmaSegmentPlan[] {
	if (!pattern || pattern.length < 2) {
		return [];
	}

	if (pattern.map((segment) => segment.normalizedForm).join('') !== normalizedForm) {
		return [];
	}

	const { leading, trailing } = edgePunctuationLengths(surfaceForm);
	const coreEnd = surfaceForm.length - trailing;
	const core = surfaceForm.slice(leading, coreEnd);
	if (core.toLowerCase() !== normalizedForm) {
		return [];
	}

	let cursor = leading;
	return pattern.map((segment, index): AutoLemmaSegmentPlan => {
		const isFirst = index === 0;
		const isLast = index === pattern.length - 1;
		const segmentStart = isFirst ? 0 : cursor;
		const segmentEnd = isLast ? surfaceForm.length : cursor + segment.normalizedForm.length;
		cursor += segment.normalizedForm.length;

		return {
			segmentOrder: index,
			segmentStart,
			segmentEnd,
			surfaceForm: surfaceForm.slice(segmentStart, segmentEnd),
			normalizedForm: segment.normalizedForm,
			wordId: segment.wordId,
			autoLinked: true
		};
	});
}

async function loadAutoLemmaMatches(
	db: AutoLemmaDb,
	inputs: AutoLemmaLookupInput[]
): Promise<Map<string, string>> {
	const requestedForms = new Set(distinct(lookupInputForms(inputs)));
	const lookupForms = distinct(lookupInputForms(inputs).flatMap(lookupFormVariants));
	if (requestedForms.size === 0 || lookupForms.length === 0) {
		return new Map();
	}

	const surfaceLookups = lookupInputSurfaceForms(inputs);
	const surfaceRows = surfaceLookups.length
		? await db.exampleSentenceToken.findMany({
				where: {
					OR: surfaceLookups.map(({ normalizedForm, surfaceForm }) => ({
						surfaceForm: { equals: surfaceForm, mode: 'insensitive' },
						normalizedForm: { in: lookupFormVariants(normalizedForm) },
						wordId: { not: null }
					}))
				},
				select: { surfaceForm: true, normalizedForm: true, wordId: true }
			})
		: [];

	const surfaceCandidates = new Map<string, Set<string>>();
	for (const row of surfaceRows) {
		if (!row.wordId) continue;
		const normalizedForm = effectiveNormalizedForm(row.normalizedForm);
		if (!requestedForms.has(normalizedForm)) continue;
		const wordIds = surfaceCandidates.get(normalizedForm) ?? new Set<string>();
		wordIds.add(row.wordId);
		surfaceCandidates.set(normalizedForm, wordIds);
	}

	const surfaceMatches = new Map<string, string>();
	for (const [normalizedForm, wordIds] of surfaceCandidates) {
		if (wordIds.size === 1) {
			surfaceMatches.set(normalizedForm, [...wordIds][0]);
		}
	}

	const rows = await db.observedWordForm.findMany({
		where: { normalizedForm: { in: lookupForms } },
		orderBy: [{ normalizedForm: 'asc' }, { usageCount: 'desc' }, { wordId: 'asc' }],
		select: { normalizedForm: true, wordId: true }
	});

	const candidates = new Map<string, Set<string>>();
	for (const row of rows) {
		const normalizedForm = effectiveNormalizedForm(row.normalizedForm);
		if (!requestedForms.has(normalizedForm)) continue;
		const wordIds = candidates.get(normalizedForm) ?? new Set<string>();
		wordIds.add(row.wordId);
		candidates.set(normalizedForm, wordIds);
	}

	const matches = new Map<string, string>();
	for (const [normalizedForm, wordIds] of candidates) {
		const surfaceMatch = surfaceMatches.get(normalizedForm);
		if (surfaceMatch) {
			matches.set(normalizedForm, surfaceMatch);
		} else if (wordIds.size === 1) {
			matches.set(normalizedForm, [...wordIds][0]);
		}
	}

	for (const [normalizedForm, wordId] of surfaceMatches) {
		if (!matches.has(normalizedForm)) {
			matches.set(normalizedForm, wordId);
		}
	}

	return matches;
}

export async function loadAutoLemmaInContextTranslations(
	db: AutoLemmaDb,
	pairsOrMatches: Iterable<AutoLemmaTranslationPair>
): Promise<Map<AutoLemmaTranslationKey, string>> {
	const pairs = [
		...new Map(
			[...pairsOrMatches]
				.map(([normalizedForm, wordId]) => [effectiveNormalizedForm(normalizedForm), wordId])
				.filter(([normalizedForm, wordId]) => normalizedForm && wordId)
				.map(([normalizedForm, wordId]) => [
					translationKey(normalizedForm, wordId),
					[normalizedForm, wordId] as AutoLemmaTranslationPair
				])
		).values()
	];
	if (pairs.length === 0) {
		return new Map();
	}

	const lookupPairs = [
		...new Map(
			pairs.flatMap(([normalizedForm, wordId]) =>
				lookupFormVariants(normalizedForm).map((lookupForm) => [
					translationKey(lookupForm, wordId),
					[lookupForm, wordId] as AutoLemmaTranslationPair
				])
			)
		).values()
	];

	const rows = await db.exampleSentenceToken.findMany({
		where: {
			OR: lookupPairs.map(([normalizedForm, wordId]) => ({ normalizedForm, wordId })),
			inContextTranslation: { not: null }
		},
		orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
		select: {
			normalizedForm: true,
			wordId: true,
			inContextTranslation: true
		}
	});

	const candidates = new Map<
		AutoLemmaTranslationKey,
		Map<string, { count: number; firstIndex: number }>
	>();
	for (const [index, row] of rows.entries()) {
		if (!row.wordId) continue;
		const translation = row.inContextTranslation?.trim();
		if (!translation) continue;
		const normalizedForm = effectiveNormalizedForm(row.normalizedForm);
		if (!normalizedForm) continue;
		const key = translationKey(normalizedForm, row.wordId);
		const values = candidates.get(key) ?? new Map<string, { count: number; firstIndex: number }>();
		const current = values.get(translation);
		values.set(translation, {
			count: (current?.count ?? 0) + 1,
			firstIndex: current?.firstIndex ?? index
		});
		candidates.set(key, values);
	}

	const translations = new Map<AutoLemmaTranslationKey, string>();
	for (const [key, values] of candidates) {
		const [translation] = [...values.entries()].sort(
			([, left], [, right]) => right.count - left.count || left.firstIndex - right.firstIndex
		)[0];
		translations.set(key, translation);
	}

	return translations;
}

async function loadAutoLemmaSegmentPatterns(
	db: AutoLemmaDb,
	normalizedForms: string[]
): Promise<Map<string, AutoLemmaSegmentPattern>> {
	const requestedForms = new Set(distinct(normalizedForms.map(effectiveNormalizedForm)));
	const lookupForms = distinct(normalizedForms.flatMap(lookupFormVariants));
	if (requestedForms.size === 0 || lookupForms.length === 0) {
		return new Map();
	}

	const rows = await db.exampleSentenceToken.findMany({
		where: {
			normalizedForm: { in: lookupForms },
			segments: { some: {} }
		},
		select: {
			normalizedForm: true,
			segments: {
				orderBy: { segmentOrder: 'asc' },
				select: {
					normalizedForm: true,
					wordId: true
				}
			}
		}
	});

	const candidates = new Map<string, Map<string, AutoLemmaSegmentPattern>>();
	for (const row of rows) {
		const normalizedForm = effectiveNormalizedForm(row.normalizedForm);
		const segments = row.segments.map((segment) => ({
			normalizedForm: effectiveNormalizedForm(segment.normalizedForm),
			wordId: segment.wordId
		}));
		if (
			!requestedForms.has(normalizedForm) ||
			segments.length < 2 ||
			segments.some((segment) => !segment.normalizedForm || !segment.wordId) ||
			segments.map((segment) => segment.normalizedForm).join('') !== normalizedForm
		) {
			continue;
		}

		const pattern = segments.map((segment) => ({
			normalizedForm: segment.normalizedForm,
			wordId: segment.wordId!
		}));
		const signature = pattern
			.map((segment) => `${segment.normalizedForm}\u0000${segment.wordId}`)
			.join('\u0001');
		const formCandidates = candidates.get(normalizedForm) ?? new Map();
		formCandidates.set(signature, pattern);
		candidates.set(normalizedForm, formCandidates);
	}

	const patterns = new Map<string, AutoLemmaSegmentPattern>();
	for (const [normalizedForm, formCandidates] of candidates) {
		if (formCandidates.size === 1) {
			patterns.set(normalizedForm, [...formCandidates.values()][0]);
		}
	}

	return patterns;
}

export function buildAutoLemmaTokenPlans(
	tokenData: TokenizedWord[],
	existingTokens: ExistingLemmaAnnotation[],
	matches: Map<string, string>,
	segmentPatterns: Map<string, AutoLemmaSegmentPattern> = new Map(),
	inContextTranslations: Map<AutoLemmaTranslationKey, string> = new Map()
): AutoLemmaPlanResult {
	const usedIndexes = new Set<number>();
	let autoLinkedCount = 0;

	const tokens = tokenData.map((incoming): AutoLemmaTokenPlan => {
		const incomingNormalized = effectiveNormalizedForm(incoming.normalizedForm);
		const preserved = findPreservedAnnotation(incoming, existingTokens, usedIndexes);
		const splitSegments = splitMarkedTokenSegments(incoming.surfaceForm);

		if (splitSegments.length > 0 && !preserved?.wordId) {
			const segments = splitSegments.map((segment): AutoLemmaSegmentPlan => {
				const wordId = matches.get(segment.normalizedForm) ?? null;
				if (wordId) autoLinkedCount += 1;
				return {
					...segment,
					wordId,
					autoLinked: Boolean(wordId)
				};
			});

			return {
				tokenOrder: incoming.tokenOrder,
				surfaceForm: incoming.surfaceForm,
				normalizedForm: incomingNormalized,
				wordId: null,
				inContextTranslation: preserved?.inContextTranslation?.trim()
					? preserved.inContextTranslation
					: null,
				segments,
				autoLinked: segments.some((segment) => segment.autoLinked)
			};
		}

		const knownSegments =
			!preserved?.wordId
				? inferKnownFusedTokenSegments(
						incoming.surfaceForm,
						incomingNormalized,
						segmentPatterns.get(incomingNormalized)
					)
				: [];
		if (knownSegments.length > 0) {
			autoLinkedCount += knownSegments.length;
			return {
				tokenOrder: incoming.tokenOrder,
				surfaceForm: incoming.surfaceForm,
				normalizedForm: incomingNormalized,
				wordId: null,
				inContextTranslation: preserved?.inContextTranslation?.trim()
					? preserved.inContextTranslation
					: null,
				segments: knownSegments,
				autoLinked: true
			};
		}

		const autoWordId = preserved?.wordId ? null : matches.get(incomingNormalized) ?? null;
		if (autoWordId) autoLinkedCount += 1;
		const translationWordId = preserved?.wordId ?? autoWordId;
		const autoInContextTranslation = translationWordId
			? inContextTranslations.get(translationKey(incomingNormalized, translationWordId)) ?? null
			: null;

		return {
			tokenOrder: incoming.tokenOrder,
			surfaceForm: incoming.surfaceForm,
			normalizedForm: incomingNormalized,
			wordId: preserved?.wordId ?? autoWordId ?? null,
			inContextTranslation: preserved?.inContextTranslation?.trim()
				? preserved.inContextTranslation
				: autoInContextTranslation,
			segments: [],
			autoLinked: Boolean(autoWordId)
		};
	});

	return { tokens, autoLinkedCount };
}

export async function resolveAutoLemmaTokenPlans(
	db: AutoLemmaDb,
	tokenData: TokenizedWord[],
	existingTokens: ExistingLemmaAnnotation[] = []
): Promise<AutoLemmaPlanResult> {
	const patternForms = tokenData
		.filter((token) => !token.surfaceForm.includes('|'))
		.map((token) => token.normalizedForm);
	const normalizedForms = tokenData.flatMap((token) => [
		{ normalizedForm: token.normalizedForm, surfaceForm: token.surfaceForm },
		...splitMarkedTokenSegments(token.surfaceForm).map((segment) => ({
			normalizedForm: segment.normalizedForm,
			surfaceForm: segment.surfaceForm
		}))
	]);
	const existingTranslationPairs: AutoLemmaTranslationPair[] = existingTokens
		.filter((token) => token.wordId && !token.inContextTranslation?.trim())
		.map((token) => [token.normalizedForm, token.wordId!]);
	const [matches, segmentPatterns] = await Promise.all([
		loadAutoLemmaMatches(db, normalizedForms),
		loadAutoLemmaSegmentPatterns(db, patternForms)
	]);
	const inContextTranslations = await loadAutoLemmaInContextTranslations(db, [
		...matches.entries(),
		...existingTranslationPairs
	]);
	return buildAutoLemmaTokenPlans(
		tokenData,
		existingTokens,
		matches,
		segmentPatterns,
		inContextTranslations
	);
}

function tokenCreateData(token: AutoLemmaTokenPlan) {
	return {
		tokenOrder: token.tokenOrder,
		surfaceForm: token.surfaceForm,
		normalizedForm: token.normalizedForm,
		wordId: token.wordId,
		inContextTranslation: token.inContextTranslation,
		...(token.segments.length > 0
			? {
					segments: {
						createMany: {
							data: token.segments.map((segment) => ({
								segmentOrder: segment.segmentOrder,
								segmentStart: segment.segmentStart,
								segmentEnd: segment.segmentEnd,
								surfaceForm: segment.surfaceForm,
								normalizedForm: segment.normalizedForm,
								wordId: segment.wordId
							}))
						}
					}
				}
			: {})
	};
}

export async function createExampleSentenceTokensFromPlans(
	db: AutoLemmaDb,
	exampleSentenceId: string,
	plans: AutoLemmaTokenPlan[]
): Promise<void> {
	if (plans.every((token) => token.segments.length === 0)) {
		await db.exampleSentenceToken.createMany({
			data: plans.map((token) => ({
				exampleSentenceId,
				tokenOrder: token.tokenOrder,
				surfaceForm: token.surfaceForm,
				normalizedForm: token.normalizedForm,
				...(token.wordId ? { wordId: token.wordId } : {}),
				...(token.inContextTranslation?.trim()
					? { inContextTranslation: token.inContextTranslation }
					: {})
			}))
		});
		return;
	}

	for (const token of plans) {
		await db.exampleSentenceToken.create({
			data: {
				exampleSentenceId,
				...tokenCreateData(token)
			}
		});
	}
}

export function collectLinkedWordIds(plans: AutoLemmaTokenPlan[]): string[] {
	return distinct(
		plans.flatMap((token) => [
			token.wordId ?? '',
			...token.segments.map((segment) => segment.wordId ?? '')
		])
	);
}

export async function createWordSentenceLinks(
	db: AutoLemmaDb,
	exampleSentenceId: string,
	wordIds: string[]
): Promise<void> {
	const linkedWordIds = distinct(wordIds);
	if (linkedWordIds.length === 0) {
		return;
	}

	await db.wordSentence.createMany({
		data: linkedWordIds.map((wordId) => ({ wordId, exampleSentenceId })),
		skipDuplicates: true
	});
}

export async function recordAutoLemmaObservedForms(
	db: AutoLemmaDb,
	plans: AutoLemmaTokenPlan[]
): Promise<void> {
	for (const token of plans) {
		if (token.autoLinked && token.wordId) {
			await recordObservedWordForm(db, {
				wordId: token.wordId,
				normalizedForm: token.normalizedForm
			});
		}
		for (const segment of token.segments) {
			if (segment.autoLinked && segment.wordId) {
				await recordObservedWordForm(db, {
					wordId: segment.wordId,
					normalizedForm: segment.normalizedForm
				});
			}
		}
	}
}

export async function createExampleSentenceWithAutoLemma(
	db: AutoLemmaDb,
	input: ExampleSentenceCreateInput
) {
	const plan = await resolveAutoLemmaTokenPlans(db, input.tokenData);

	const sentence = await db.exampleSentence.create({
		data: {
			kalenjin: input.kalenjin,
			english: input.english,
			...(input.notes !== undefined ? { notes: input.notes } : {}),
			status: 'NEEDS_PROOFREAD',
			lemmaProofreadAt: null,
			tokens: {
				create: plan.tokens.map(tokenCreateData)
			}
		}
	});

	await createWordSentenceLinks(db, sentence.id, collectLinkedWordIds(plan.tokens));
	await recordAutoLemmaObservedForms(db, plan.tokens);

	return sentence;
}

type ExistingSentenceForAutoLemma = {
	id: string;
	tokens: Array<{
		id: string;
		surfaceForm: string;
		normalizedForm: string;
		wordId: string | null;
		inContextTranslation: string | null;
		segments: Array<{
			id: string;
			normalizedForm: string;
			wordId: string | null;
		}>;
	}>;
};

export type AutoLemmatizeExistingSummary = {
	scannedSentences: number;
	updatedSentences: number;
	linkedWords: number;
	translatedWords: number;
};

export type AutoLemmatizeExistingOptions = {
	sentenceId?: string;
	limit?: number;
};

export async function autoLemmatizeMissingExampleSentenceWords(
	db: PrismaClient,
	options: AutoLemmatizeExistingOptions = {}
): Promise<AutoLemmatizeExistingSummary> {
	const autoFillWhere = {
		tokens: {
			some: {
				OR: [
					{ wordId: null },
					{ AND: [{ wordId: null }, { surfaceForm: { contains: '|' } }] },
					{ segments: { some: { wordId: null } } },
					{ AND: [{ wordId: { not: null } }, { inContextTranslation: null }] }
				]
			}
		}
	};
	const sentences = (await db.exampleSentence.findMany({
		where: {
			...(options.sentenceId ? { id: options.sentenceId } : {}),
			...autoFillWhere
		},
		orderBy: { updatedAt: 'desc' },
		...(options.limit ? { take: options.limit } : {}),
		select: {
			id: true,
			tokens: {
				orderBy: { tokenOrder: 'asc' },
				select: {
					id: true,
					surfaceForm: true,
					normalizedForm: true,
					wordId: true,
					inContextTranslation: true,
					segments: {
						orderBy: { segmentOrder: 'asc' },
						select: {
							id: true,
							normalizedForm: true,
							wordId: true
						}
					}
				}
			}
		}
	})) as ExistingSentenceForAutoLemma[];

	const normalizedForms = sentences.flatMap((sentence) =>
		sentence.tokens.flatMap((token) => [
			...(token.wordId
				? []
				: [{ normalizedForm: effectiveNormalizedForm(token.normalizedForm), surfaceForm: token.surfaceForm }]),
			...(token.wordId || token.segments.length > 0
				? []
				: splitMarkedTokenSegments(token.surfaceForm).map((segment) => ({
						normalizedForm: segment.normalizedForm,
						surfaceForm: segment.surfaceForm
					}))),
			...token.segments
				.filter((segment) => !segment.wordId)
				.map((segment) => ({ normalizedForm: effectiveNormalizedForm(segment.normalizedForm) }))
		])
	);
	const existingTranslationPairs: AutoLemmaTranslationPair[] = sentences.flatMap((sentence) =>
		sentence.tokens
			.filter((token) => token.wordId && !token.inContextTranslation?.trim())
			.map((token) => [effectiveNormalizedForm(token.normalizedForm), token.wordId!] as AutoLemmaTranslationPair)
	);
	const patternForms = sentences.flatMap((sentence) =>
		sentence.tokens
			.filter((token) => !token.wordId && token.segments.length === 0 && !token.surfaceForm.includes('|'))
			.map((token) => effectiveNormalizedForm(token.normalizedForm))
	);
	const [matches, segmentPatterns] = await Promise.all([
		loadAutoLemmaMatches(db, normalizedForms),
		loadAutoLemmaSegmentPatterns(db, patternForms)
	]);
	const inContextTranslations = await loadAutoLemmaInContextTranslations(db, [
		...matches.entries(),
		...existingTranslationPairs
	]);

	let updatedSentences = 0;
	let linkedWords = 0;
	let translatedWords = 0;

	for (const sentence of sentences) {
		const tokenUpdates: Array<{
			tokenId: string;
			normalizedForm: string;
			wordId: string;
			inContextTranslation: string | null;
		}> = [];
		const tokenTranslationUpdates: Array<{
			tokenId: string;
			inContextTranslation: string;
		}> = [];
		const segmentUpdates: Array<{ segmentId: string; normalizedForm: string; wordId: string }> = [];
		const segmentCreates: Array<{
			tokenId: string;
			segments: AutoLemmaSegmentPlan[];
		}> = [];

		for (const token of sentence.tokens) {
			const tokenNormalizedForm = effectiveNormalizedForm(token.normalizedForm);
			if (token.wordId && !token.inContextTranslation?.trim()) {
				const translation = inContextTranslations.get(
					translationKey(tokenNormalizedForm, token.wordId)
				);
				if (translation) {
					tokenTranslationUpdates.push({
						tokenId: token.id,
						inContextTranslation: translation
					});
				}
			}

			const splitSegments = splitMarkedTokenSegments(token.surfaceForm);
			if (splitSegments.length > 0 && token.segments.length === 0 && !token.wordId) {
				const segments = splitSegments.map((segment): AutoLemmaSegmentPlan => ({
					...segment,
					wordId: matches.get(segment.normalizedForm) ?? null,
					autoLinked: Boolean(matches.get(segment.normalizedForm))
				}));
				if (segments.some((segment) => segment.wordId)) {
					segmentCreates.push({ tokenId: token.id, segments });
				}
				continue;
			}

			if (!token.wordId && token.segments.length === 0) {
				const knownSegments = inferKnownFusedTokenSegments(
					token.surfaceForm,
					tokenNormalizedForm,
					segmentPatterns.get(tokenNormalizedForm)
				);
				if (knownSegments.length > 0) {
					segmentCreates.push({ tokenId: token.id, segments: knownSegments });
					continue;
				}

				const directWordId = matches.get(tokenNormalizedForm);
				if (directWordId) {
					tokenUpdates.push({
						tokenId: token.id,
						normalizedForm: tokenNormalizedForm,
						wordId: directWordId,
						inContextTranslation:
							inContextTranslations.get(translationKey(tokenNormalizedForm, directWordId)) ?? null
					});
					continue;
				}
			}

			for (const segment of token.segments) {
				if (segment.wordId) continue;
				const segmentNormalizedForm = effectiveNormalizedForm(segment.normalizedForm);
				const wordId = matches.get(segmentNormalizedForm);
				if (!wordId) continue;
				segmentUpdates.push({
					segmentId: segment.id,
					normalizedForm: segmentNormalizedForm,
					wordId
				});
			}
		}

		const sentenceLinkedRows = [
			...tokenUpdates.map((update) => ({
				wordId: update.wordId,
				normalizedForm: update.normalizedForm
			})),
			...segmentUpdates.map((update) => ({
				wordId: update.wordId,
				normalizedForm: update.normalizedForm
			})),
			...segmentCreates.flatMap((entry) =>
				entry.segments
					.filter((segment) => segment.wordId)
					.map((segment) => ({
						wordId: segment.wordId!,
						normalizedForm: segment.normalizedForm
					}))
			)
		];

		if (sentenceLinkedRows.length === 0 && tokenTranslationUpdates.length === 0) {
			continue;
		}

		await db.$transaction(async (tx) => {
			for (const update of tokenTranslationUpdates) {
				await tx.exampleSentenceToken.update({
					where: { id: update.tokenId },
					data: { inContextTranslation: update.inContextTranslation }
				});
			}

			for (const update of tokenUpdates) {
				await tx.exampleSentenceToken.update({
					where: { id: update.tokenId },
					data: {
						wordId: update.wordId,
						...(update.inContextTranslation
							? { inContextTranslation: update.inContextTranslation }
							: {})
					}
				});
			}

			for (const update of segmentUpdates) {
				await tx.exampleSentenceTokenSegment.update({
					where: { id: update.segmentId },
					data: { wordId: update.wordId }
				});
			}

			for (const entry of segmentCreates) {
				await tx.exampleSentenceToken.update({
					where: { id: entry.tokenId },
					data: { wordId: null }
				});
				await tx.exampleSentenceTokenSegment.createMany({
					data: entry.segments.map((segment) => ({
						tokenId: entry.tokenId,
						segmentOrder: segment.segmentOrder,
						segmentStart: segment.segmentStart,
						segmentEnd: segment.segmentEnd,
						surfaceForm: segment.surfaceForm,
						normalizedForm: segment.normalizedForm,
						wordId: segment.wordId
					}))
				});
			}

			await createWordSentenceLinks(
				tx,
				sentence.id,
				sentenceLinkedRows.map((row) => row.wordId)
			);

			for (const row of sentenceLinkedRows) {
				await recordObservedWordForm(tx, row);
			}

			await tx.exampleSentence.update({
				where: { id: sentence.id },
				data: { status: 'NEEDS_PROOFREAD', lemmaProofreadAt: null }
			});
		});

		updatedSentences += 1;
		linkedWords += sentenceLinkedRows.length;
		translatedWords +=
			tokenTranslationUpdates.length +
			tokenUpdates.filter((update) => update.inContextTranslation?.trim()).length;
	}

	return {
		scannedSentences: sentences.length,
		updatedSentences,
		linkedWords,
		translatedWords
	};
}
