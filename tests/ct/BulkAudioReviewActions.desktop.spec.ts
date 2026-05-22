import { expect, test } from '@playwright/experimental-ct-svelte';
import BulkAudioReviewActionsHarness from './BulkAudioReviewActionsHarness.svelte';

test('shows Play all when idle and fires onPlayAll', async ({ mount, page }) => {
	await mount(BulkAudioReviewActionsHarness, { props: { playing: false, keepCount: 2 } });

	await expect(page.getByRole('button', { name: 'Stop' })).toHaveCount(0);
	await page.getByRole('button', { name: 'Play all' }).click();
	await expect(page.getByTestId('log')).toHaveText('playAll');
});

test('shows Stop while playing and fires onStop', async ({ mount, page }) => {
	await mount(BulkAudioReviewActionsHarness, { props: { playing: true } });

	await expect(page.getByRole('button', { name: 'Play all' })).toHaveCount(0);
	await page.getByRole('button', { name: 'Stop' }).click();
	await expect(page.getByTestId('log')).toHaveText('stop');
});

test('disables Play all when nothing is kept', async ({ mount, page }) => {
	await mount(BulkAudioReviewActionsHarness, { props: { playing: false, keepCount: 0 } });

	await expect(page.getByRole('button', { name: 'Play all' })).toBeDisabled();
});

test('Save selected shows the keep count and is disabled when nothing kept or to redo', async ({
	mount,
	page
}) => {
	await mount(BulkAudioReviewActionsHarness, { props: { keepCount: 3, redoCount: 0 } });
	await expect(page.getByRole('button', { name: /Save selected/ })).toContainText('3');
	await page.getByRole('button', { name: /Save selected/ }).click();
	await expect(page.getByTestId('log')).toHaveText('save');

	await mount(BulkAudioReviewActionsHarness, { props: { keepCount: 0, redoCount: 0 } });
	await expect(page.getByRole('button', { name: /Save selected/ }).last()).toBeDisabled();
});

test('discard fires onDiscard', async ({ mount, page }) => {
	await mount(BulkAudioReviewActionsHarness, {});
	await page.getByRole('button', { name: 'Discard' }).click();
	await expect(page.getByTestId('log')).toHaveText('discard');
});

test('Re-record is hidden with no redo items and pluralizes the label otherwise', async ({
	mount,
	page
}) => {
	await mount(BulkAudioReviewActionsHarness, { props: { redoCount: 0 } });
	await expect(page.getByRole('button', { name: /Re-record/ })).toHaveCount(0);

	await mount(BulkAudioReviewActionsHarness, { props: { redoCount: 1 } });
	await expect(page.getByRole('button', { name: 'Re-record 1 word' })).toBeVisible();

	await mount(BulkAudioReviewActionsHarness, { props: { redoCount: 3 } });
	const rerec = page.getByRole('button', { name: 'Re-record 3 words' });
	await expect(rerec).toBeVisible();
	await rerec.click();
	await expect(page.getByTestId('log').last()).toHaveText('rerecord');
});
