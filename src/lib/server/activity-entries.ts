import { error, fail, type Actions } from '@sveltejs/kit';
import { Prisma, type ExampleSentenceStatus, type PartOfSpeech } from '@prisma/client';
import { isPartOfSpeech } from '$lib/parts-of-speech';
import { parseStatsRange } from '$lib/stats-preferences';
import { prisma } from './prisma';
import { requireAdmin, requireEditor } from './guards';
import { attachDictionaryHrefs } from './dictionary-hrefs';
import { prepareIncertainForm, preparePluralForms } from './kalenjin-word-search';
import { normalizeLemma } from './normalize-lemma';
import { propagateKalenjinRename } from './propagate-rename';
import { rangeBounds } from './stats';
import { deleteUploadedImage } from './uploads';
import { generateUniqueWordSlug } from './word-slugs';

const PAGE_SIZE = 50;

type ActivityEntryType = 'words' | 'sentences';

export type ActivityEntry = {
	id: string;
	href: string;
	kalenjin: string;
	english: string;
	createdAt: Date;
	/** Words only. */
	proofreadAt?: Date | null;
	partOfSpeech?: PartOfSpeech | null;
	pluralForm?: string | null;
	incertainForm?: string | null;
	isPluralOnly?: boolean;
	isSingularOnly?: boolean;
	/** Sentences only. */
	status?: ExampleSentenceStatus;
};

function parsePage(raw: string | null): number {
	const n = Number(raw);
	if (!Number.isFinite(n) || n < 1) return 1;
	return Math.floor(n);
}

/** Load one user's words or sentences for the activity views. */
export async function loadActivityEntries(userId: string, url: URL, viewerIsAdmin: boolean) {
	const type: ActivityEntryType =
		url.searchParams.get('type') === 'sentences' ? 'sentences' : 'words';
	const range = parseStatsRange(url.searchParams.get('range'));
	const page = parsePage(url.searchParams.get('page'));

	const targetUser = await prisma.user.findUnique({
		where: { id: userId },
		select: { id: true, username: true, displayName: true, role: true }
	});
	if (!targetUser) error(404, 'User not found.');

	const { from, to } = await rangeBounds(range);
	const where = {
		createdById: targetUser.id,
		...(range === 'allTime' ? {} : { createdAt: { gte: from, lt: to } })
	};

	let totalCount: number;
	/** Words marked proofread within the same filter; null on the sentences view. */
	let proofreadCount: number | null = null;
	let entries: ActivityEntry[];

	if (type === 'words') {
		const [count, accepted, words] = await Promise.all([
			prisma.word.count({ where }),
			prisma.word.count({ where: { ...where, proofreadAt: { not: null } } }),
			prisma.word.findMany({
				where,
				orderBy: { createdAt: 'desc' },
				skip: (page - 1) * PAGE_SIZE,
				take: PAGE_SIZE,
				select: {
					id: true,
					kalenjin: true,
					slug: true,
					translations: true,
					createdAt: true,
					proofreadAt: true,
					partOfSpeech: true,
					pluralForm: true,
					incertainForm: true,
					isPluralOnly: true,
					isSingularOnly: true
				}
			})
		]);
		totalCount = count;
		proofreadCount = accepted;
		entries = (await attachDictionaryHrefs(prisma, words)).map((word) => ({
			id: word.id,
			href: word.href,
			kalenjin: word.kalenjin,
			english: word.translations,
			createdAt: word.createdAt,
			proofreadAt: word.proofreadAt,
			partOfSpeech: word.partOfSpeech,
			pluralForm: word.pluralForm,
			incertainForm: word.incertainForm,
			isPluralOnly: word.isPluralOnly,
			isSingularOnly: word.isSingularOnly
		}));
	} else {
		const [count, sentences] = await Promise.all([
			prisma.exampleSentence.count({ where }),
			prisma.exampleSentence.findMany({
				where,
				orderBy: { createdAt: 'desc' },
				skip: (page - 1) * PAGE_SIZE,
				take: PAGE_SIZE,
				select: { id: true, kalenjin: true, english: true, createdAt: true, status: true }
			})
		]);
		totalCount = count;
		entries = sentences.map((sentence) => ({
			id: sentence.id,
			href: `/corpus/${sentence.id}`,
			kalenjin: sentence.kalenjin,
			english: sentence.english,
			createdAt: sentence.createdAt,
			status: sentence.status
		}));
	}

	return {
		targetUser,
		viewerIsAdmin,
		type,
		range,
		page,
		pageSize: PAGE_SIZE,
		totalCount,
		proofreadCount,
		entries
	};
}

export type ActivityEntriesData = Awaited<ReturnType<typeof loadActivityEntries>>;

/** Form actions shared by the admin drill-down and the staff activity page. */
export const activityEntryActions = {
	setWordProofread: async ({ request, locals }) => {
		requireAdmin(locals);
		const data = await request.formData();
		const wordId = String(data.get('wordId') ?? '').trim();
		const proofread = String(data.get('proofread') ?? '') === '1';

		if (!wordId) {
			return fail(400, { proofreadError: 'Word is required.' });
		}

		await prisma.word.update({
			where: { id: wordId },
			data: { proofreadAt: proofread ? new Date() : null }
		});

		return {
			proofreadSuccess: proofread ? 'Word marked proofread.' : 'Word returned to not proofread.'
		};
	},

	updateWordKalenjin: async ({ request, locals }) => {
		requireEditor(locals);
		const data = await request.formData();
		const wordId = String(data.get('wordId') ?? '').trim();
		const kalenjin = String(data.get('kalenjin') ?? '').trim();

		if (!wordId) return fail(400, { updateError: 'Word is required.' });
		if (!kalenjin) return fail(400, { updateError: 'The Kalenjin spelling cannot be empty.' });

		await prisma.$transaction(async (tx) => {
			// Lock the row so concurrent renames serialize (same as the entry edit page).
			const rows = await tx.$queryRaw<Array<{ kalenjin: string; slug: string }>>(
				Prisma.sql`SELECT "kalenjin", "slug" FROM "Word" WHERE "id" = ${wordId} FOR UPDATE`
			);
			const existing = rows[0];
			if (!existing) error(404, 'Word not found.');
			if (existing.kalenjin === kalenjin) return;

			await tx.word.update({
				where: { id: wordId },
				data: {
					kalenjin,
					kalenjinNormalized: normalizeLemma(kalenjin),
					slug: await generateUniqueWordSlug(tx, kalenjin, wordId)
				}
			});
			await propagateKalenjinRename(tx, wordId, kalenjin, existing.slug);
		});

		return { updateSuccess: 'Word updated.' };
	},

	updateWordPartOfSpeech: async ({ request, locals }) => {
		requireEditor(locals);
		const data = await request.formData();
		const wordId = String(data.get('wordId') ?? '').trim();
		const rawPos = String(data.get('partOfSpeech') ?? '').trim();

		if (!wordId) return fail(400, { updateError: 'Word is required.' });
		if (rawPos && !isPartOfSpeech(rawPos)) {
			return fail(400, { updateError: `Unknown part of speech: "${rawPos}".` });
		}

		const partOfSpeech: PartOfSpeech | null = rawPos ? (rawPos as PartOfSpeech) : null;
		const canHavePlural = partOfSpeech === 'NOUN' || partOfSpeech === 'ADJECTIVE';
		await prisma.word.update({
			where: { id: wordId },
			data: {
				partOfSpeech,
				// Same invariants as the full edit form: forms that no longer apply are cleared.
				...(canHavePlural
					? {}
					: {
							pluralForm: null,
							pluralFormNormalized: null,
							isPluralOnly: false,
							isSingularOnly: false
						}),
				...(partOfSpeech === 'NOUN'
					? {}
					: { incertainForm: null, incertainFormNormalized: null }),
				...(partOfSpeech === 'VERB'
					? {}
					: {
							presentAnee: null,
							presentInyee: null,
							presentInee: null,
							presentEchek: null,
							presentOkwek: null,
							presentIchek: null
						})
			}
		});

		return { updateSuccess: 'Part of speech updated.' };
	},

	updateWordField: async ({ request, locals }) => {
		requireEditor(locals);
		const data = await request.formData();
		const wordId = String(data.get('wordId') ?? '').trim();
		const field = String(data.get('field') ?? '').trim();
		const rawValue = String(data.get('value') ?? '').trim();

		if (!wordId) return fail(400, { updateError: 'Word is required.' });

		if (field === 'translations') {
			if (!rawValue) return fail(400, { updateError: 'Translations cannot be empty.' });
			await prisma.word.update({ where: { id: wordId }, data: { translations: rawValue } });
			return { updateSuccess: 'Translations updated.' };
		}

		const word = await prisma.word.findUnique({
			where: { id: wordId },
			select: { partOfSpeech: true, isPluralOnly: true, isSingularOnly: true }
		});
		if (!word) return fail(404, { updateError: 'Word not found.' });

		if (field === 'pluralForm') {
			const canHavePlural =
				(word.partOfSpeech === 'NOUN' || word.partOfSpeech === 'ADJECTIVE') &&
				!word.isPluralOnly;
			if (!canHavePlural) {
				return fail(400, { updateError: 'This word cannot have a plural form.' });
			}
			const { pluralForm, pluralFormNormalized } = preparePluralForms(rawValue);
			await prisma.word.update({
				where: { id: wordId },
				data: {
					pluralForm,
					pluralFormNormalized,
					// Entering a plural for a singular-only word means it isn't
					// singular-only after all.
					...(pluralForm && word.isSingularOnly ? { isSingularOnly: false } : {})
				}
			});
			return { updateSuccess: 'Plural form updated.' };
		}

		if (field === 'incertainForm') {
			const canHaveIncertain = word.partOfSpeech === 'NOUN' && !word.isPluralOnly;
			if (!canHaveIncertain) {
				return fail(400, { updateError: 'Only nouns can have an incertain form.' });
			}
			const { incertainForm, incertainFormNormalized } = prepareIncertainForm(rawValue);
			await prisma.word.update({
				where: { id: wordId },
				data: { incertainForm, incertainFormNormalized }
			});
			return { updateSuccess: 'Incertain form updated.' };
		}

		return fail(400, { updateError: `Unknown field: "${field}".` });
	},

	deleteWord: async ({ request, locals }) => {
		requireEditor(locals);
		const data = await request.formData();
		const wordId = String(data.get('wordId') ?? '').trim();

		if (!wordId) return fail(400, { updateError: 'Word is required.' });

		const existing = await prisma.word.findUnique({
			where: { id: wordId },
			select: { kalenjin: true, imageUrl: true }
		});
		if (!existing) return fail(404, { updateError: 'Word not found.' });

		await prisma.word.delete({ where: { id: wordId } });
		if (existing.imageUrl) await deleteUploadedImage(existing.imageUrl);

		return { deleteSuccess: `"${existing.kalenjin}" deleted from the dictionary.` };
	}
} satisfies Actions;
