import { fail } from '@sveltejs/kit';
import type { Prisma, SuggestionStatus } from '@prisma/client';
import { prisma } from '$lib/server/prisma';
import { requireEditor } from '$lib/server/guards';
import { createOrUpdateLinkedWord, readPresentTenseFromFormData } from '$lib/server/lemma-words';
import { createExampleSentenceWithAutoLemma } from '$lib/server/auto-lemma';
import { findMatchingExampleSentence } from '$lib/server/example-sentence-dedupe';
import { tokenizeSentence } from '$lib/server/tokenize';
import { combinePluralFormVariants } from '$lib/plural-form-variants';
import { relatedWordPair } from '$lib/server/related-words';
import { deleteUploadedImage, saveUploadedImage, UploadError } from '$lib/server/uploads';
import { isPartOfSpeech } from '$lib/parts-of-speech';
import { normalizeSentenceText } from '$lib/server/suggestions';
import type { Actions, PageServerLoad } from './$types';

function readText(formData: FormData, key: string): string {
	return String(formData.get(key) ?? '').trim();
}

/**
 * Thrown inside a transaction when an atomic claim on a PENDING suggestion
 * fails because another reviewer resolved it first. Catching this outside
 * the transaction lets us return a 409 cleanly while the transaction rolls
 * back any work we did (Word/ExampleSentence creates, related links).
 */
class SuggestionRaceError extends Error {
	constructor() {
		super('Another reviewer already resolved this suggestion.');
		this.name = 'SuggestionRaceError';
	}
}

const VALID_STATUSES: readonly SuggestionStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];

function parseStatusFilter(value: string | null): SuggestionStatus | 'ALL' {
	if (value === 'ALL') return 'ALL';
	if (value && (VALID_STATUSES as readonly string[]).includes(value)) {
		return value as SuggestionStatus;
	}
	return 'PENDING';
}

export const load: PageServerLoad = async ({ locals, url }) => {
	requireEditor(locals);

	const statusFilter = parseStatusFilter(url.searchParams.get('status'));
	const where = statusFilter === 'ALL' ? {} : { status: statusFilter };

	const submitterSelect = {
		id: true,
		username: true,
		displayName: true
	} as const;
	const reviewerSelect = submitterSelect;

	const [wordSuggestions, sentenceSuggestions, pendingCounts] = await Promise.all([
		prisma.wordSuggestion.findMany({
			where,
			orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
			take: 200,
			include: {
				submitter: { select: submitterSelect },
				reviewer: { select: reviewerSelect },
				approvedWord: { select: { id: true, kalenjin: true } }
			}
		}),
		prisma.sentenceSuggestion.findMany({
			where,
			orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
			take: 200,
			include: {
				submitter: { select: submitterSelect },
				reviewer: { select: reviewerSelect },
				approvedSentence: { select: { id: true, kalenjin: true } }
			}
		}),
		Promise.all([
			prisma.wordSuggestion.count({ where: { status: 'PENDING' } }),
			prisma.sentenceSuggestion.count({ where: { status: 'PENDING' } })
		])
	]);

	return {
		statusFilter,
		wordSuggestions,
		sentenceSuggestions,
		pendingWordCount: pendingCounts[0],
		pendingSentenceCount: pendingCounts[1]
	};
};

export const actions: Actions = {
	approveWord: async ({ request, locals }) => {
		const reviewer = requireEditor(locals);
		const formData = await request.formData();
		const suggestionId = readText(formData, 'suggestionId');
		const reviewNote = readText(formData, 'reviewNote') || null;

		const suggestion = await prisma.wordSuggestion.findUnique({ where: { id: suggestionId } });
		if (!suggestion) return fail(404, { error: 'Suggestion not found.' });
		if (suggestion.status !== 'PENDING') {
			return fail(400, { error: 'Suggestion is already resolved.' });
		}

		// Read the edited lemma data submitted by the reviewer from the add-word popup.
		const kalenjin = readText(formData, 'kalenjin');
		const translations = readText(formData, 'translations');
		const alternativeSpellings = readText(formData, 'alternativeSpellings');
		const notes = readText(formData, 'notes');
		const partOfSpeechRaw = readText(formData, 'partOfSpeech');
		const pluralFormRaw = readText(formData, 'pluralForm');
		const isPluralOnlyRaw = readText(formData, 'isPluralOnly');
		const alternativePluralForms = readText(formData, 'alternativePluralForms');
		const relatedWordIds = [
			...new Set(
				readText(formData, 'relatedWordIds')
					.split(',')
					.map((rid) => rid.trim())
					.filter(Boolean)
			)
		];

		if (!kalenjin || !translations) {
			return fail(400, { error: 'Kalenjin and translations are required.' });
		}
		if (partOfSpeechRaw && !isPartOfSpeech(partOfSpeechRaw)) {
			return fail(400, { error: 'Invalid part of speech value.' });
		}
		const partOfSpeech = partOfSpeechRaw && isPartOfSpeech(partOfSpeechRaw) ? partOfSpeechRaw : null;
		const canHavePlural = partOfSpeech === 'NOUN' || partOfSpeech === 'ADJECTIVE';
		const isPluralOnly = canHavePlural && isPluralOnlyRaw === 'on';
		const combinedPluralForms = combinePluralFormVariants(pluralFormRaw, alternativePluralForms);
		const pluralForm =
			canHavePlural && !isPluralOnly && combinedPluralForms ? combinedPluralForms : null;
		const presentTense =
			partOfSpeech === 'VERB' ? readPresentTenseFromFormData(formData) : null;

		if (relatedWordIds.length > 0) {
			const found = await prisma.word.findMany({
				where: { id: { in: relatedWordIds } },
				select: { id: true }
			});
			if (found.length !== relatedWordIds.length) {
				return fail(400, { error: 'One or more related words could not be found.' });
			}
		}

		const imageFile = formData.get('image');
		let imageUrl: string | null = null;
		if (imageFile instanceof File && imageFile.size > 0) {
			try {
				imageUrl = await saveUploadedImage(imageFile);
			} catch (err) {
				if (err instanceof UploadError) {
					return fail(400, { error: err.message });
				}
				throw err;
			}
		}

		let word;
		try {
			word = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
				// Atomically claim the suggestion: only proceeds if it's still PENDING.
				// `updateMany` returns count=0 if another reviewer already approved or
				// declined it; we throw to abort the transaction and roll back any
				// Word/RelatedWord rows we created in this branch.
				const claim = await tx.wordSuggestion.updateMany({
					where: { id: suggestion.id, status: 'PENDING' },
					data: {
						status: 'APPROVED',
						reviewerId: reviewer.id,
						reviewNote,
						reviewedAt: new Date()
					}
				});
				if (claim.count === 0) {
					throw new SuggestionRaceError();
				}
				const created = await createOrUpdateLinkedWord(tx, {
					kalenjin,
					translations,
					notes: notes || null,
					alternativeSpellings,
					partOfSpeech,
					pluralForm,
					isPluralOnly,
					presentTense,
					imageUrl
				});
				if (relatedWordIds.length > 0) {
					await tx.relatedWord.createMany({
						data: relatedWordIds.map((rid) => relatedWordPair(created.id, rid)),
						skipDuplicates: true
					});
				}
				await tx.wordSuggestion.update({
					where: { id: suggestion.id },
					data: { approvedWordId: created.id }
				});
				return created;
			});
		} catch (err) {
			if (imageUrl) {
				await deleteUploadedImage(imageUrl);
			}
			if (err instanceof SuggestionRaceError) {
				return fail(409, { error: err.message });
			}
			throw err;
		}

		return { word: { id: word.id, kalenjin: word.kalenjin }, approvedSuggestionId: suggestion.id };
	},

	rejectWord: async ({ request, locals }) => {
		const reviewer = requireEditor(locals);
		const formData = await request.formData();
		const id = readText(formData, 'id');
		const reviewNote = readText(formData, 'reviewNote') || null;

		if (!id) return fail(400, { error: 'Missing suggestion id.' });

		// Atomic claim: succeeds only if the row is still PENDING.
		const claim = await prisma.wordSuggestion.updateMany({
			where: { id, status: 'PENDING' },
			data: {
				status: 'REJECTED',
				reviewerId: reviewer.id,
				reviewNote,
				reviewedAt: new Date()
			}
		});
		if (claim.count === 0) {
			return fail(409, { error: 'Suggestion was already resolved or does not exist.' });
		}

		return { rejectedWord: { suggestionId: id } };
	},

	approveSentence: async ({ request, locals }) => {
		const reviewer = requireEditor(locals);
		const formData = await request.formData();
		const suggestionId = readText(formData, 'suggestionId') || readText(formData, 'id');
		const reviewNote = readText(formData, 'reviewNote') || null;

		const suggestion = await prisma.sentenceSuggestion.findUnique({ where: { id: suggestionId } });
		if (!suggestion) return fail(404, { error: 'Suggestion not found.' });
		if (suggestion.status !== 'PENDING') {
			return fail(400, { error: 'Suggestion is already resolved.' });
		}

		// Read the edited fields submitted from the review modal. Fall back to the
		// stored suggestion values when a caller didn't include them (legacy callers
		// or programmatic approve buttons that just send the id).
		const kalenjin = normalizeSentenceText(
			readText(formData, 'kalenjin') || suggestion.kalenjin
		);
		const english = normalizeSentenceText(
			readText(formData, 'english') || suggestion.english
		);
		const notesRaw = formData.has('notes')
			? readText(formData, 'notes') || null
			: suggestion.notes;

		if (!kalenjin || !english) {
			return fail(400, { error: 'Kalenjin sentence and English translation are required.' });
		}

		const existing = await findMatchingExampleSentence(prisma, kalenjin, english);

		let approvedSentenceId: string;
		if (existing) {
			// Match found: atomically claim the suggestion as APPROVED → existing row.
			const claim = await prisma.sentenceSuggestion.updateMany({
				where: { id: suggestion.id, status: 'PENDING' },
				data: {
					status: 'APPROVED',
					reviewerId: reviewer.id,
					reviewNote,
					reviewedAt: new Date(),
					approvedSentenceId: existing.id
				}
			});
			if (claim.count === 0) {
				return fail(409, {
					error: 'Suggestion was already resolved or does not exist.'
				});
			}
			approvedSentenceId = existing.id;
		} else {
			const tokenData = tokenizeSentence(kalenjin);
			if (tokenData.length === 0) {
				return fail(400, {
					error: 'Could not extract tokens from the Kalenjin sentence.'
				});
			}
			try {
				const sentence = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
					// Claim the suggestion first so a concurrent approval rolls back
					// before we spend the work tokenising and inserting an
					// ExampleSentence.
					const claim = await tx.sentenceSuggestion.updateMany({
						where: { id: suggestion.id, status: 'PENDING' },
						data: {
							status: 'APPROVED',
							reviewerId: reviewer.id,
							reviewNote,
							reviewedAt: new Date()
						}
					});
					if (claim.count === 0) throw new SuggestionRaceError();

					const created = await createExampleSentenceWithAutoLemma(tx, {
						kalenjin,
						english,
						notes: notesRaw,
						tokenData
					});
					await tx.sentenceSuggestion.update({
						where: { id: suggestion.id },
						data: { approvedSentenceId: created.id }
					});
					return created;
				});
				approvedSentenceId = sentence.id;
			} catch (err) {
				if (err instanceof SuggestionRaceError) {
					return fail(409, { error: err.message });
				}
				throw err;
			}
		}

		return {
			approvedSentence: { suggestionId: suggestion.id, sentenceId: approvedSentenceId }
		};
	},

	rejectSentence: async ({ request, locals }) => {
		const reviewer = requireEditor(locals);
		const formData = await request.formData();
		const id = readText(formData, 'id');
		const reviewNote = readText(formData, 'reviewNote') || null;

		if (!id) return fail(400, { error: 'Missing suggestion id.' });

		const claim = await prisma.sentenceSuggestion.updateMany({
			where: { id, status: 'PENDING' },
			data: {
				status: 'REJECTED',
				reviewerId: reviewer.id,
				reviewNote,
				reviewedAt: new Date()
			}
		});
		if (claim.count === 0) {
			return fail(409, { error: 'Suggestion was already resolved or does not exist.' });
		}

		return { rejectedSentence: { suggestionId: id } };
	}
};
