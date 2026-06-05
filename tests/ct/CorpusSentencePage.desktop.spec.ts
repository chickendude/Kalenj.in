import { expect, test } from '@playwright/experimental-ct-svelte';
import CorpusSentencePageHarness from './CorpusSentencePageHarness.svelte';

test('shows an editable translation placeholder when sentence english is empty', async ({
	mount,
	page
}) => {
	await mount(CorpusSentencePageHarness);

	await expect(page.getByText('Add translation...', { exact: true })).toBeVisible();
	await expect(
		page.getByText("It's like your mother's head is bad today.", { exact: true })
	).toBeVisible();
	await expect(page.getByText('Add notes...', { exact: true })).toHaveCount(0);
});
