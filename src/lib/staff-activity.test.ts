import { describe, expect, it } from 'vitest';
import { buildStaffActivity, type ActivityUser } from './staff-activity';

const admin: ActivityUser = { id: 'u1', username: 'amos', displayName: 'Amos', role: 'ADMIN' };
const manager: ActivityUser = { id: 'u2', username: 'beth', displayName: null, role: 'MANAGER' };
const learner: ActivityUser = { id: 'u3', username: 'carol', displayName: null, role: 'USER' };

const emptyCounts = {
	words: [],
	wordsInRange: [],
	wordsNotProofread: [],
	wordsNotProofreadInRange: [],
	sentences: [],
	sentencesInRange: [],
	sentencesNotProofread: [],
	sentencesNotProofreadInRange: []
};

describe('buildStaffActivity', () => {
	it('always includes staff users, even with no contributions', () => {
		const { rows } = buildStaffActivity([admin, manager, learner], emptyCounts);
		expect(rows.map((row) => row.userId)).toEqual(['u1', 'u2']);
		expect(rows[0]).toMatchObject({ words: 0, wordsInRange: 0, sentences: 0, sentencesInRange: 0 });
	});

	it('includes non-staff users only when they have contributed', () => {
		const { rows } = buildStaffActivity([admin, learner], {
			...emptyCounts,
			words: [{ createdById: 'u3', count: 2 }]
		});
		expect(rows.map((row) => row.userId)).toEqual(['u3', 'u1']);
	});

	it('joins word and sentence counts per user', () => {
		const { rows } = buildStaffActivity([admin, manager], {
			...emptyCounts,
			words: [
				{ createdById: 'u1', count: 10 },
				{ createdById: 'u2', count: 3 }
			],
			wordsInRange: [{ createdById: 'u2', count: 1 }],
			wordsNotProofread: [{ createdById: 'u2', count: 2 }],
			wordsNotProofreadInRange: [{ createdById: 'u2', count: 1 }],
			sentences: [{ createdById: 'u2', count: 5 }],
			sentencesInRange: [{ createdById: 'u2', count: 4 }],
			sentencesNotProofread: [{ createdById: 'u2', count: 3 }]
		});
		expect(rows.find((row) => row.userId === 'u1')).toMatchObject({ words: 10, sentences: 0 });
		expect(rows.find((row) => row.userId === 'u2')).toMatchObject({
			words: 3,
			wordsInRange: 1,
			wordsNotProofread: 2,
			wordsNotProofreadInRange: 1,
			sentences: 5,
			sentencesInRange: 4,
			sentencesNotProofread: 3,
			sentencesNotProofreadInRange: 0
		});
	});

	it('sorts by in-range activity, then all-time totals, then username', () => {
		const { rows } = buildStaffActivity([admin, manager], {
			...emptyCounts,
			words: [
				{ createdById: 'u1', count: 100 },
				{ createdById: 'u2', count: 5 }
			],
			wordsInRange: [{ createdById: 'u2', count: 5 }]
		});
		// u2 is more active in the range even though u1 leads all-time.
		expect(rows.map((row) => row.userId)).toEqual(['u2', 'u1']);

		const allTimeTieBreak = buildStaffActivity([admin, manager], {
			...emptyCounts,
			words: [{ createdById: 'u2', count: 1 }]
		});
		expect(allTimeTieBreak.rows.map((row) => row.userId)).toEqual(['u2', 'u1']);

		const tied = buildStaffActivity([manager, admin], emptyCounts);
		expect(tied.rows.map((row) => row.username)).toEqual(['amos', 'beth']);
	});

	it('reports unattributed entries separately', () => {
		const { rows, unattributed } = buildStaffActivity([admin], {
			...emptyCounts,
			words: [{ createdById: null, count: 7 }],
			sentences: [{ createdById: null, count: 9 }]
		});
		expect(unattributed).toEqual({ words: 7, sentences: 9 });
		expect(rows).toHaveLength(1);
		expect(rows[0].words).toBe(0);
	});
});
