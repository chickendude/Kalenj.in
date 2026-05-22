import { expect, test } from '@playwright/experimental-ct-svelte';
import BulkConfirmDialogHarness from './BulkConfirmDialogHarness.svelte';

test('renders the dialog and its body when open', async ({ mount, page }) => {
	await mount(BulkConfirmDialogHarness, { props: { open: true } });

	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await expect(dialog).toHaveAttribute('aria-labelledby', 't');
	await expect(dialog).toContainText('Title here');
});

test('renders nothing when closed', async ({ mount, page }) => {
	await mount(BulkConfirmDialogHarness, { props: { open: false } });

	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(page.locator('.confirm-backdrop')).toHaveCount(0);
});

test('closes on Escape', async ({ mount, page }) => {
	await mount(BulkConfirmDialogHarness, { props: { open: true } });

	await page.getByTestId('inside').focus();
	await page.keyboard.press('Escape');

	await expect(page.getByTestId('closes')).toHaveText('1');
});

test('closes on backdrop click but not on clicks inside the dialog', async ({ mount, page }) => {
	await mount(BulkConfirmDialogHarness, { props: { open: true } });

	// Clicking content inside the dialog must not close it.
	await page.getByTestId('inside').click();
	await expect(page.getByTestId('closes')).toHaveText('0');

	// Clicking the backdrop (outside the centered dialog) closes it.
	await page.locator('.confirm-backdrop').click({ position: { x: 4, y: 4 } });
	await expect(page.getByTestId('closes')).toHaveText('1');
});
