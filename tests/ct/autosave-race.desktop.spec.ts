import { expect, test } from '@playwright/experimental-ct-svelte';
import type { Page } from 'playwright/test';
import AutosaveRaceHarness from './AutosaveRaceHarness.svelte';

type SavedRequest = { order: number; value: string };

const SAVE_ROUTE = '**/__ct/update';

function tokenUpdateResponse(value: string) {
	return {
		type: 'success',
		data: {
			tokenUpdates: [
				{
					tokenId: 'token-1',
					wordId: 'word-1',
					inContextTranslation: value,
					word: { id: 'word-1', kalenjin: 'kibendi', translations: 'they went' }
				}
			]
		}
	};
}

// Routes the autosave endpoint. The first save is held back for `slowMs` to
// model a slow network round-trip; later saves resolve quickly. Each response
// echoes the value that request sent (a realistic server response, and exactly
// the stale payload that used to clobber the field).
async function routeSaves(
	page: Page,
	requests: SavedRequest[],
	options: { slowMs: number; fastMs?: number }
) {
	const { slowMs, fastMs = 40 } = options;
	let count = 0;
	await page.route(SAVE_ROUTE, async (route) => {
		const order = ++count;
		const body = route.request().postDataJSON() as { inContextTranslation?: string };
		const value = body?.inContextTranslation ?? '';
		requests.push({ order, value });

		await new Promise((resolve) => setTimeout(resolve, order === 1 ? slowMs : fastMs));

		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(tokenUpdateResponse(value))
		});
	});
}

test('a slow stale save does not overwrite text typed while it was in flight', async ({
	mount,
	page
}) => {
	const requests: SavedRequest[] = [];
	await routeSaves(page, requests, { slowMs: 2500 });

	const component = await mount(AutosaveRaceHarness);
	const meaning = component.getByPlaceholder('Meaning');
	await expect(meaning).toHaveValue('');

	// Type the first value and let the 500ms debounce fire the (slow) save.
	await meaning.fill('ki');
	await page.waitForTimeout(800);
	expect(requests.map((r) => r.value)).toEqual(['ki']);

	// While that save is still in flight, keep typing. This must schedule a
	// fresh save and must NOT be undone when the slow response lands.
	await meaning.fill('kibe');
	await page.waitForTimeout(800);
	await expect(meaning).toHaveValue('kibe');

	// The second (fast) save has now resolved with the newer value.
	expect(requests.map((r) => r.value)).toEqual(['ki', 'kibe']);

	// Wait out the original slow response. Pre-fix, its stale "ki" payload
	// reset the field; with the generation guard it is ignored.
	await page.waitForTimeout(2200);
	await expect(meaning).toHaveValue('kibe');

	// Only the final text reached the server, and it was the last write.
	expect(requests.at(-1)?.value).toBe('kibe');
	expect(requests.filter((r) => r.value === 'kibe')).not.toHaveLength(0);
});

test('a save with no interleaved typing applies the response and marks saved', async ({
	mount,
	page
}) => {
	const requests: SavedRequest[] = [];
	await routeSaves(page, requests, { slowMs: 40 });

	const component = await mount(AutosaveRaceHarness);
	const meaning = component.getByPlaceholder('Meaning');

	await meaning.fill('they left');
	await page.waitForTimeout(800);

	await expect(meaning).toHaveValue('they left');
	await expect(meaning).toHaveClass(/meaning-input--saved/);
	expect(requests).toHaveLength(1);
	expect(requests[0]?.value).toBe('they left');
});
