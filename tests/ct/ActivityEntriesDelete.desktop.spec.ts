import { expect, test } from '@playwright/experimental-ct-svelte';
import ActivityEntriesDeleteHarness from './ActivityEntriesDeleteHarness.svelte';

test('deleting a word waits for the confirmation dialog', async ({ mount, page }) => {
	const deletePosts: Array<Record<string, string>> = [];
	await page.route(
		(url) => url.search.includes('deleteWord'),
		async (route) => {
			deletePosts.push(route.request().postDataJSON());
			await route.fulfill({ json: { type: 'success', status: 200 } });
		}
	);

	await mount(ActivityEntriesDeleteHarness, {});

	await page.getByRole('button', { name: 'Delete teget' }).click();

	// The dialog is open and nothing has been sent yet.
	await expect(page.getByRole('dialog', { name: 'Delete this word?' })).toBeVisible();
	expect(deletePosts).toHaveLength(0);

	// Cancelling closes the dialog without deleting.
	await page.getByRole('button', { name: 'Cancel' }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	expect(deletePosts).toHaveLength(0);

	// Confirming performs exactly one delete for the right word.
	await page.getByRole('button', { name: 'Delete teget' }).click();
	await page.getByRole('button', { name: 'Delete word' }).click();
	await expect.poll(() => deletePosts).toHaveLength(1);
	expect(deletePosts[0]).toEqual({ wordId: 'word-1' });
});
