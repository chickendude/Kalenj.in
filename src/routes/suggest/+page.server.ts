import { fail, redirect } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { parseSentenceSuggestion, parseWordSuggestion } from '$lib/server/suggestions';
import { PARTS_OF_SPEECH, PART_OF_SPEECH_LABELS } from '$lib/parts-of-speech';
import type { Actions, PageServerLoad } from './$types';

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
			const existing = await prisma.wordSuggestion.findUnique({
				where: { id: editingId },
				select: { id: true, submitterId: true, status: true }
			});
			if (!existing || existing.submitterId !== user.id) {
				return fail(404, { wordError: 'Suggestion not found.' });
			}
			if (existing.status !== 'PENDING') {
				return fail(400, {
					wordError: 'This suggestion has already been reviewed and can no longer be edited.'
				});
			}
			await prisma.wordSuggestion.update({
				where: { id: editingId },
				data: parsed.value
			});
			return { wordUpdated: { kalenjin: parsed.value.kalenjin } };
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
			const existing = await prisma.sentenceSuggestion.findUnique({
				where: { id: editingId },
				select: { id: true, submitterId: true, status: true }
			});
			if (!existing || existing.submitterId !== user.id) {
				return fail(404, { sentenceError: 'Suggestion not found.' });
			}
			if (existing.status !== 'PENDING') {
				return fail(400, {
					sentenceError:
						'This suggestion has already been reviewed and can no longer be edited.'
				});
			}
			await prisma.sentenceSuggestion.update({
				where: { id: editingId },
				data: {
					kalenjin: parsed.value.kalenjin,
					english: parsed.value.english,
					notes: parsed.value.notes
				}
			});
			return { sentenceUpdated: true };
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
