import { expect, test } from '@playwright/experimental-ct-svelte';
import BulkAudioReviewTableHarness from './BulkAudioReviewTableHarness.svelte';

test('renders one row per result with index, primary, and secondary', async ({ mount, page }) => {
	await mount(BulkAudioReviewTableHarness, {});

	await expect(page.locator('tbody tr')).toHaveCount(2);
	await expect(page.getByText('01').first()).toBeVisible();
	await expect(page.getByText('Chamge')).toBeVisible();
	await expect(page.getByText('good morning')).toBeVisible();
	await expect(page.getByText('Achobe')).toBeVisible();
	await expect(page.getByText('I cook')).toBeVisible();
});

test('renders a badge when the item has one', async ({ mount, page }) => {
	await mount(BulkAudioReviewTableHarness, {});
	const badge = page.locator('.bulk-list-badge');
	await expect(badge).toHaveCount(1);
	await expect(badge).toHaveText('verb');
});

test('applies skip-row and redo-row classes based on state', async ({ mount, page }) => {
	await mount(BulkAudioReviewTableHarness, {
		props: { states: { 'word-1': 'skip', 'word-2': 'redo' } }
	});

	await expect(page.locator('tbody tr.skip-row')).toHaveCount(1);
	await expect(page.locator('tbody tr.redo-row')).toHaveCount(1);
});

test('marks the playing row with .playing and toggles the play-btn icon', async ({ mount, page }) => {
	await mount(BulkAudioReviewTableHarness, { props: { playingItemId: 'word-2' } });

	await expect(page.locator('tbody tr.playing')).toHaveCount(1);
	await expect(page.locator('tbody tr.playing')).toHaveAttribute('data-row-item-id', 'word-2');
	// The playing row's play button should have the is-playing class.
	await expect(page.locator('tbody tr.playing .play-btn.is-playing')).toHaveCount(1);
});

test('fires onPlay / onToggleKeepSkip / onToggleRedo with the row targetId', async ({
	mount,
	page
}) => {
	await mount(BulkAudioReviewTableHarness, {});

	// First row's play button (idle -> Play label).
	const firstRow = page.locator('[data-row-item-id="word-1"]');
	await firstRow.getByRole('button', { name: 'Play' }).click();
	await expect(page.getByTestId('log')).toHaveText('play:word-1');

	// Second row's keep-toggle (default 'keep' label is "Keep").
	const secondRow = page.locator('[data-row-item-id="word-2"]');
	await secondRow.getByRole('button', { name: 'Keep' }).click();
	await expect(page.getByTestId('log')).toContainText('keepSkip:word-2');

	// Second row's re-record button.
	await secondRow.getByRole('button', { name: 'Queue for re-record' }).click();
	await expect(page.getByTestId('log')).toContainText('redo:word-2');
});

test("flips the keep-toggle label to 'Skip' when the row is in skip state", async ({
	mount,
	page
}) => {
	await mount(BulkAudioReviewTableHarness, {
		props: { states: { 'word-1': 'skip' } }
	});

	const skipRow = page.locator('[data-row-item-id="word-1"]');
	await expect(skipRow.getByRole('button', { name: 'Skip' })).toBeVisible();
});

test('shows the formatted timestamp for each row', async ({ mount, page }) => {
	await mount(BulkAudioReviewTableHarness, {});

	const timestamps = page.locator('.timestamp');
	await expect(timestamps.nth(0)).toHaveText('0:01.50');
	await expect(timestamps.nth(1)).toHaveText('0:02.00');
});
