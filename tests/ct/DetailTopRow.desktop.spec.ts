import { expect, test } from '@playwright/experimental-ct-svelte';
import DetailTopRowHarness from './DetailTopRowHarness.svelte';

test('detail top rows align back links with action buttons and keep bottom padding', async ({
	mount,
	page
}) => {
	await mount(DetailTopRowHarness);

	for (const rowTestId of ['dictionary-row', 'corpus-row']) {
		const metrics = await page.getByTestId(rowTestId).evaluate((row) => {
			const backLink = row.querySelector('.back-link');
			const reportButton = row.querySelector('.icon-action-btn');
			const rowStyle = getComputedStyle(row);
			if (!backLink || !reportButton) {
				throw new Error('Expected row to contain a back link and action button.');
			}

			return {
				backTop: backLink.getBoundingClientRect().top,
				reportTop: reportButton.getBoundingClientRect().top,
				marginBottom: rowStyle.marginBottom
			};
		});

		expect(Math.abs(metrics.backTop - metrics.reportTop)).toBeLessThanOrEqual(1);
		expect(metrics.marginBottom).toBe('12px');
	}
});
