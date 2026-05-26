import { fail, redirect } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { parseSentenceSuggestion, parseWordSuggestion } from '$lib/server/suggestions';
import { PARTS_OF_SPEECH, PART_OF_SPEECH_LABELS } from '$lib/parts-of-speech';
import type { Actions, PageServerLoad } from './$types';

/**
 * Per-user cap on PENDING suggestions across both word and sentence queues.
 * Soft anti-spam: once a user has this many awaiting review, they have to
 * wait for staff to clear some out before submitting more.
 */
const MAX_PENDING_PER_USER = 50;

function requireSignedIn(locals: App.Locals, url: URL): NonNullable<App.Locals['user']> {
	if (!locals.user) {
		const redirectTo = encodeURIComponent(url.pathname);
		throw redirect(303, `/login?redirectTo=${redirectTo}`);
	}
	// Staff add words directly; the contribute flow is just for regular users.
	if (locals.user.role !== 'USER') {
		throw redirect(303, '/admin/suggestions');
	}
	return locals.user;
}

async function countPendingSuggestionsFor(userId: string): Promise<number> {
	const [words, sentences] = await Promise.all([
		prisma.wordSuggestion.count({ where: { submitterId: userId, status: 'PENDING' } }),
		prisma.sentenceSuggestion.count({ where: { submitterId: userId, status: 'PENDING' } })
	]);
	return words + sentences;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireSignedIn(locals, url);

	const [wordSuggestions, sentenceSuggestions] = await Promise.all([
		prisma.wordSuggestion.findMany({
			where: { submitterId: user.id },
			orderBy: { createdAt: 'desc' },
			take: 20
		}),
		prisma.sentenceSuggestion.findMany({
			where: { submitterId: user.id },
			orderBy: { createdAt: 'desc' },
			take: 20
		})
	]);

	return {
		wordSuggestions,
		sentenceSuggestions,
		partsOfSpeech: PARTS_OF_SPEECH.map((value) => ({
			value,
			label: PART_OF_SPEECH_LABELS[value]
		}))
	};
};

export const actions: Actions = {
	suggestWord: async ({ request, locals, url }) => {
		const user = requireSignedIn(locals, url);

		const formData = await request.formData();
		const editingId = String(formData.get('editingId') ?? '').trim() || null;
		const parsed = parseWordSuggestion(formData);

		if (!parsed.ok) {
			return fail(400, {
				wordError: parsed.error,
				wordEditingId: editingId,
				wordValues: {
					kalenjin: String(formData.get('kalenjin') ?? ''),
					translations: String(formData.get('translations') ?? ''),
					partOfSpeech: String(formData.get('partOfSpeech') ?? ''),
					notes: String(formData.get('notes') ?? ''),
					alternativeSpellings: String(formData.get('alternativeSpellings') ?? ''),
					pluralForm: String(formData.get('pluralForm') ?? ''),
					isPluralOnly: String(formData.get('isPluralOnly') ?? '') === 'on',
					alternativePluralForms: String(formData.get('alternativePluralForms') ?? ''),
					presentAnee: String(formData.get('presentAnee') ?? ''),
					presentInyee: String(formData.get('presentInyee') ?? ''),
					presentInee: String(formData.get('presentInee') ?? ''),
					presentEchek: String(formData.get('presentEchek') ?? ''),
					presentOkwek: String(formData.get('presentOkwek') ?? ''),
					presentIchek: String(formData.get('presentIchek') ?? '')
				}
			});
		}

		if (editingId) {
			// Atomic check-and-update: only succeeds if the row is still PENDING and
			// owned by this user. Avoids a TOCTOU between "fetch + verify" and
			// "update" where staff could approve the suggestion mid-flight.
			const updated = await prisma.wordSuggestion.updateMany({
				where: { id: editingId, submitterId: user.id, status: 'PENDING' },
				data: parsed.value
			});
			if (updated.count === 0) {
				return fail(400, {
					wordError:
						'This suggestion can no longer be edited (either not yours or already reviewed).'
				});
			}
			return { wordUpdated: { kalenjin: parsed.value.kalenjin } };
		}

		if ((await countPendingSuggestionsFor(user.id)) >= MAX_PENDING_PER_USER) {
			return fail(429, {
				wordError: `You already have ${MAX_PENDING_PER_USER} suggestions awaiting review. Please wait for staff to look through them before adding more.`
			});
		}

		await prisma.wordSuggestion.create({
			data: {
				...parsed.value,
				submitterId: user.id
			}
		});

		return { wordSubmitted: { kalenjin: parsed.value.kalenjin } };
	},

	suggestSentence: async ({ request, locals, url }) => {
		const user = requireSignedIn(locals, url);

		const formData = await request.formData();
		const editingId = String(formData.get('editingId') ?? '').trim() || null;
		const parsed = parseSentenceSuggestion(formData);

		if (!parsed.ok) {
			return fail(400, {
				sentenceError: parsed.error,
				sentenceEditingId: editingId,
				sentenceValues: {
					kalenjin: String(formData.get('kalenjin') ?? ''),
					english: String(formData.get('english') ?? ''),
					notes: String(formData.get('notes') ?? '')
				}
			});
		}

		if (editingId) {
			const updated = await prisma.sentenceSuggestion.updateMany({
				where: { id: editingId, submitterId: user.id, status: 'PENDING' },
				data: {
					kalenjin: parsed.value.kalenjin,
					english: parsed.value.english,
					notes: parsed.value.notes
				}
			});
			if (updated.count === 0) {
				return fail(400, {
					sentenceError:
						'This suggestion can no longer be edited (either not yours or already reviewed).'
				});
			}
			return { sentenceUpdated: true };
		}

		if ((await countPendingSuggestionsFor(user.id)) >= MAX_PENDING_PER_USER) {
			return fail(429, {
				sentenceError: `You already have ${MAX_PENDING_PER_USER} suggestions awaiting review. Please wait for staff to look through them before adding more.`
			});
		}

		await prisma.sentenceSuggestion.create({
			data: {
				kalenjin: parsed.value.kalenjin,
				english: parsed.value.english,
				notes: parsed.value.notes,
				submitterId: user.id
			}
		});

		return { sentenceSubmitted: true };
	}
};
