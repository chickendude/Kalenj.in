import { describe, expect, it, vi } from 'vitest';
import {
	recordObservedWordForm,
	removeObservedWordForm,
	replaceObservedWordForm
} from './observed-word-forms';

function makePrisma() {
	return {
		observedWordForm: {
			upsert: vi.fn().mockResolvedValue({}),
			updateMany: vi.fn().mockResolvedValue({ count: 1 }),
			deleteMany: vi.fn().mockResolvedValue({ count: 0 })
		}
	};
}

describe('recordObservedWordForm', () => {
	it('increments an existing observed form or creates it', async () => {
		const prisma = makePrisma();

		await recordObservedWordForm(prisma, {
			wordId: 'word-am',
			normalizedForm: 'aame'
		});

		expect(prisma.observedWordForm.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					normalizedForm_wordId: {
						normalizedForm: 'aame',
						wordId: 'word-am'
					}
				},
				update: expect.objectContaining({
					usageCount: { increment: 1 }
				}),
				create: expect.objectContaining({
					normalizedForm: 'aame',
					wordId: 'word-am',
					usageCount: 1
				})
			})
		);
	});
});

describe('removeObservedWordForm', () => {
	it('decrements the observed form and deletes it if the count reaches zero', async () => {
		const prisma = makePrisma();

		await removeObservedWordForm(prisma, {
			wordId: 'word-am',
			normalizedForm: 'aame'
		});

		expect(prisma.observedWordForm.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					normalizedForm: 'aame',
					wordId: 'word-am',
					usageCount: { gt: 1 }
				}),
				data: expect.objectContaining({
					usageCount: { decrement: 1 }
				})
			})
		);
		expect(prisma.observedWordForm.deleteMany).toHaveBeenCalledWith({
			where: {
				normalizedForm: 'aame',
				wordId: 'word-am',
				usageCount: { lte: 1 }
			}
		});
	});
});

describe('replaceObservedWordForm', () => {
	it('does not rewrite unchanged observations', async () => {
		const prisma = makePrisma();

		await replaceObservedWordForm(
			prisma,
			{ wordId: 'word-am', normalizedForm: 'aame' },
			{ wordId: 'word-am', normalizedForm: 'aame' }
		);

		expect(prisma.observedWordForm.updateMany).not.toHaveBeenCalled();
		expect(prisma.observedWordForm.deleteMany).not.toHaveBeenCalled();
		expect(prisma.observedWordForm.upsert).not.toHaveBeenCalled();
	});

	it('removes the old pair and records the new pair', async () => {
		const prisma = makePrisma();

		await replaceObservedWordForm(
			prisma,
			{ wordId: 'word-old', normalizedForm: 'aame' },
			{ wordId: 'word-new', normalizedForm: 'aame' }
		);

		expect(prisma.observedWordForm.updateMany).toHaveBeenCalledOnce();
		expect(prisma.observedWordForm.deleteMany).toHaveBeenCalledOnce();
		expect(prisma.observedWordForm.upsert).toHaveBeenCalledOnce();
	});
});
