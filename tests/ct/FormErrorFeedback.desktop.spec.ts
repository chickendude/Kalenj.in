import { expect, test } from '@playwright/experimental-ct-svelte';
import FormErrorFeedbackHarness from './FormErrorFeedbackHarness.svelte';

test('renders the error message with the form-feedback error class', async ({ mount, page }) => {
	await mount(FormErrorFeedbackHarness, {
		props: { error: 'Username already in use.' }
	});

	const banner = page.locator('.form-feedback.error');
	await expect(banner).toHaveText('Username already in use.');
});

test('renders nothing when error is null', async ({ mount, page }) => {
	await mount(FormErrorFeedbackHarness, {
		props: { error: null }
	});

	await expect(page.locator('.form-feedback')).toHaveCount(0);
});

test('renders nothing when error is undefined', async ({ mount, page }) => {
	await mount(FormErrorFeedbackHarness, { props: {} });

	await expect(page.locator('.form-feedback')).toHaveCount(0);
});

test('renders nothing when error is an empty string', async ({ mount, page }) => {
	await mount(FormErrorFeedbackHarness, {
		props: { error: '' }
	});

	await expect(page.locator('.form-feedback')).toHaveCount(0);
});
