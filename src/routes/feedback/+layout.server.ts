import { prisma } from '$lib/server/prisma';
import { requireEditor } from '$lib/server/guards';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	requireEditor(locals);

	const [pendingWordSuggestions, pendingSentenceSuggestions] = await Promise.all([
		prisma.wordSuggestion.count({ where: { status: 'PENDING' } }),
		prisma.sentenceSuggestion.count({ where: { status: 'PENDING' } })
	]);

	return {
		pendingSuggestionCount: pendingWordSuggestions + pendingSentenceSuggestions
	};
};
