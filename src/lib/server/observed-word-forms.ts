import { Prisma } from '@prisma/client';

type ObservedWordFormClient = {
	observedWordForm: {
		upsert: (args: Prisma.ObservedWordFormUpsertArgs) => Promise<unknown>;
		updateMany: (args: Prisma.ObservedWordFormUpdateManyArgs) => Promise<unknown>;
		deleteMany: (args: Prisma.ObservedWordFormDeleteManyArgs) => Promise<unknown>;
	};
};

export type ObservedWordFormInput = {
	wordId: string | null | undefined;
	normalizedForm: string | null | undefined;
};

export async function recordObservedWordForm(
	prisma: ObservedWordFormClient,
	input: ObservedWordFormInput
): Promise<void> {
	const wordId = input.wordId?.trim();
	const normalizedForm = input.normalizedForm?.trim();

	if (!wordId || !normalizedForm) {
		return;
	}

	const now = new Date();

	await prisma.observedWordForm.upsert({
		where: {
			normalizedForm_wordId: {
				normalizedForm,
				wordId
			}
		},
		update: {
			usageCount: { increment: 1 },
			lastSeenAt: now
		},
		create: {
			normalizedForm,
			wordId,
			usageCount: 1,
			firstSeenAt: now,
			lastSeenAt: now
		}
	});
}

export async function recordObservedWordForms(
	prisma: ObservedWordFormClient,
	forms: ObservedWordFormInput[]
): Promise<void> {
	for (const form of forms) {
		await recordObservedWordForm(prisma, form);
	}
}

export async function removeObservedWordForm(
	prisma: ObservedWordFormClient,
	input: ObservedWordFormInput
): Promise<void> {
	const wordId = input.wordId?.trim();
	const normalizedForm = input.normalizedForm?.trim();

	if (!wordId || !normalizedForm) {
		return;
	}

	await prisma.observedWordForm.deleteMany({
		where: {
			normalizedForm,
			wordId,
			usageCount: { lte: 1 }
		}
	});

	await prisma.observedWordForm.updateMany({
		where: {
			normalizedForm,
			wordId,
			usageCount: { gt: 1 }
		},
		data: {
			usageCount: { decrement: 1 },
			lastSeenAt: new Date()
		}
	});
}

function normalizeObservedInput(input: ObservedWordFormInput): {
	wordId: string | null;
	normalizedForm: string | null;
} {
	return {
		wordId: input.wordId?.trim() || null,
		normalizedForm: input.normalizedForm?.trim() || null
	};
}

export async function replaceObservedWordForm(
	prisma: ObservedWordFormClient,
	previous: ObservedWordFormInput,
	next: ObservedWordFormInput
): Promise<void> {
	const previousObserved = normalizeObservedInput(previous);
	const nextObserved = normalizeObservedInput(next);

	if (
		previousObserved.wordId === nextObserved.wordId &&
		previousObserved.normalizedForm === nextObserved.normalizedForm
	) {
		return;
	}

	await removeObservedWordForm(prisma, previousObserved);
	await recordObservedWordForm(prisma, nextObserved);
}
