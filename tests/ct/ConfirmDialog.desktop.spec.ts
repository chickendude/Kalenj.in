import { expect, test } from '@playwright/experimental-ct-svelte';
import ConfirmDialogHarness from './ConfirmDialogHarness.svelte';

test('auto-focuses the confirm button on open so Enter confirms by default', async ({
	mount,
	page
}) => {
	await mount(ConfirmDialogHarness, { props: { open: true } });

	await expect(page.getByRole('button', { name: 'Combine words' })).toBeFocused();

	// Enter on the focused confirm button activates it natively.
	await page.keyboard.press('Enter');
	await expect(page.getByTestId('log')).toHaveText('confirm');
});

test('regression: Enter on the focused Cancel button cancels, does not confirm', async ({
	mount,
	page
}) => {
	await mount(ConfirmDialogHarness, { props: { open: true } });

	// Tab from the focused confirm button to Cancel — Cancel is the previous
	// sibling in the DOM, so Shift+Tab is the natural way to reach it.
	await page.keyboard.press('Shift+Tab');
	await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();

	await page.keyboard.press('Enter');
	await expect(page.getByTestId('log')).toHaveText('cancel');
	await expect(page.getByTestId('log')).not.toContainText('confirm');
});

test('clicking the backdrop cancels but clicking inside the dialog does not', async ({
	mount,
	page
}) => {
	await mount(ConfirmDialogHarness, { props: { open: true } });

	// Click the dialog's title — should not close.
	await page.getByRole('heading', { name: 'Combine words?' }).click();
	await expect(page.getByTestId('log')).toHaveText('');

	// Click the backdrop in a corner — should cancel.
	await page.locator('.confirm-backdrop').click({ position: { x: 4, y: 4 } });
	await expect(page.getByTestId('log')).toHaveText('cancel');
});

test('Escape from anywhere within the modal cancels', async ({ mount, page }) => {
	await mount(ConfirmDialogHarness, { props: { open: true } });

	// Confirm is auto-focused; pressing Escape (window-level handler in the
	// component) should cancel.
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('log')).toHaveText('cancel');
});

test('renders nothing when closed', async ({ mount, page }) => {
	await mount(ConfirmDialogHarness, { props: { open: false } });

	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(page.locator('.confirm-backdrop')).toHaveCount(0);
});
