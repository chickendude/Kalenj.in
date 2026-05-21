import { expect, test } from '@playwright/experimental-ct-svelte';
import FormActionsHarness from './FormActionsHarness.svelte';

test('renders only a submit button when no cancel handler is passed', async ({ mount, page }) => {
	await mount(FormActionsHarness, {
		props: { submitLabel: 'Save reviewed sentences' }
	});

	await expect(page.getByRole('button', { name: 'Save reviewed sentences' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
});

test('shows the cancel button and fires onCancel when clicked', async ({ mount, page }) => {
	await mount(FormActionsHarness, {
		props: { submitLabel: 'Create lesson', withCancel: true }
	});

	await expect(page.getByTestId('cancel-count')).toHaveText('0');
	await page.getByRole('button', { name: 'Cancel' }).click();
	await expect(page.getByTestId('cancel-count')).toHaveText('1');
});

test('disables the submit button when submitDisabled is true', async ({ mount, page }) => {
	await mount(FormActionsHarness, {
		props: { submitLabel: 'Save reviewed sentences', submitDisabled: true }
	});

	await expect(page.getByRole('button', { name: 'Save reviewed sentences' })).toBeDisabled();
});

test('honours a custom cancelLabel', async ({ mount, page }) => {
	await mount(FormActionsHarness, {
		props: { submitLabel: 'Confirm', withCancel: true, cancelLabel: 'Discard' }
	});

	await expect(page.getByRole('button', { name: 'Discard' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
});
