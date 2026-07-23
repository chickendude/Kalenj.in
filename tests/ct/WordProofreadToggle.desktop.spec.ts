import { expect, test } from '@playwright/experimental-ct-svelte';
import WordProofreadToggleHarness from './WordProofreadToggleHarness.svelte';

test('renders a static badge when the viewer cannot edit', async ({ mount, page }) => {
	await mount(WordProofreadToggleHarness, { props: { proofread: true } });

	await expect(page.getByLabel('Status: Proofread')).toBeVisible();
	await expect(page.getByRole('button')).toHaveCount(0);
});

test('shows the not-proofread state as a warning badge', async ({ mount, page }) => {
	await mount(WordProofreadToggleHarness, { props: { proofread: false } });

	await expect(page.getByLabel('Status: Not proofread')).toBeVisible();
});

test('posts the word id to setWordProofread when toggled', async ({ mount, page }) => {
	let payload: Record<string, string> | null = null;
	await page.route(
		(url) => url.search.includes('setWordProofread'),
		async (route) => {
			payload = route.request().postDataJSON();
			await route.fulfill({ json: { type: 'success', status: 200 } });
		}
	);

	await mount(WordProofreadToggleHarness, { props: { wordId: 'word-42', canEdit: true } });

	await page.getByRole('button', { name: 'Status: Not proofread. Click to change.' }).click();

	await expect.poll(() => payload).toEqual({ wordId: 'word-42' });
});
