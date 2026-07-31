export type ActivityCount = {
	createdById: string | null;
	count: number;
};

export type ActivityUser = {
	id: string;
	username: string;
	displayName: string | null;
	role: 'ADMIN' | 'MANAGER' | 'USER';
};

type StaffActivityRow = {
	userId: string;
	username: string;
	displayName: string | null;
	role: 'ADMIN' | 'MANAGER' | 'USER';
	words: number;
	wordsInRange: number;
	wordsNotProofread: number;
	wordsNotProofreadInRange: number;
	sentences: number;
	sentencesInRange: number;
	sentencesNotProofread: number;
	sentencesNotProofreadInRange: number;
};

export type StaffActivity = {
	rows: StaffActivityRow[];
	/** Entries created before creator tracking existed (or by since-deleted users). */
	unattributed: { words: number; sentences: number };
};

function toCountMap(counts: ActivityCount[]): Map<string | null, number> {
	return new Map(counts.map((entry) => [entry.createdById, entry.count]));
}

/**
 * Combines per-user word/sentence counts into display rows. Staff users
 * (admins and managers) always get a row; other users only appear when they
 * have contributed something, so demoted accounts keep their history visible.
 * Rows are ordered by activity inside the selected range, then all-time.
 */
export function buildStaffActivity(
	users: ActivityUser[],
	counts: {
		words: ActivityCount[];
		wordsInRange: ActivityCount[];
		wordsNotProofread: ActivityCount[];
		wordsNotProofreadInRange: ActivityCount[];
		sentences: ActivityCount[];
		sentencesInRange: ActivityCount[];
		sentencesNotProofread: ActivityCount[];
		sentencesNotProofreadInRange: ActivityCount[];
	}
): StaffActivity {
	const words = toCountMap(counts.words);
	const wordsInRange = toCountMap(counts.wordsInRange);
	const wordsNotProofread = toCountMap(counts.wordsNotProofread);
	const wordsNotProofreadInRange = toCountMap(counts.wordsNotProofreadInRange);
	const sentences = toCountMap(counts.sentences);
	const sentencesInRange = toCountMap(counts.sentencesInRange);
	const sentencesNotProofread = toCountMap(counts.sentencesNotProofread);
	const sentencesNotProofreadInRange = toCountMap(counts.sentencesNotProofreadInRange);

	const rows = users
		.map(
			(user): StaffActivityRow => ({
				userId: user.id,
				username: user.username,
				displayName: user.displayName,
				role: user.role,
				words: words.get(user.id) ?? 0,
				wordsInRange: wordsInRange.get(user.id) ?? 0,
				wordsNotProofread: wordsNotProofread.get(user.id) ?? 0,
				wordsNotProofreadInRange: wordsNotProofreadInRange.get(user.id) ?? 0,
				sentences: sentences.get(user.id) ?? 0,
				sentencesInRange: sentencesInRange.get(user.id) ?? 0,
				sentencesNotProofread: sentencesNotProofread.get(user.id) ?? 0,
				sentencesNotProofreadInRange: sentencesNotProofreadInRange.get(user.id) ?? 0
			})
		)
		.filter((row) => row.role !== 'USER' || row.words > 0 || row.sentences > 0)
		.sort(
			(a, b) =>
				b.wordsInRange + b.sentencesInRange - (a.wordsInRange + a.sentencesInRange) ||
				b.words + b.sentences - (a.words + a.sentences) ||
				a.username.localeCompare(b.username)
		);

	return {
		rows,
		unattributed: {
			words: words.get(null) ?? 0,
			sentences: sentences.get(null) ?? 0
		}
	};
}
