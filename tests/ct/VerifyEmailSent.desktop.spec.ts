import { expect, test } from '@playwright/experimental-ct-svelte';
import VerifyEmailSentHarness from './VerifyEmailSentHarness.svelte';

test('shows the email from the loader and a working resend form', async ({ mount, page }) => {
	await mount(VerifyEmailSentHarness, { props: { dataEmail: 'someone@example.com' } });

	await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
	await expect(page.getByText('someone@example.com')).toBeVisible();

	const form = page.locator('form');
	await expect(form).toHaveAttribute('action', '?/resend');
	await expect(form).toHaveAttribute('method', 'POST');
	await expect(page.locator('input[name="email"]')).toHaveValue('someone@example.com');
	await expect(page.getByRole('button', { name: 'Resend verification email' })).toBeVisible();
});

test('shows the post-resend confirmation message without leaking account existence', async ({
	mount,
	page
}) => {
	await mount(VerifyEmailSentHarness, {
		props: {
			dataEmail: 'someone@example.com',
			formEmail: 'someone@example.com',
			formResent: true
		}
	});

	await expect(
		page.getByText('If that email is on file, we sent another link.')
	).toBeVisible();
});

test('renders an error feedback banner if the action returned an error', async ({
	mount,
	page
}) => {
	await mount(VerifyEmailSentHarness, {
		props: { dataEmail: '', formError: 'Missing email address.' }
	});

	await expect(page.locator('.form-feedback.error')).toHaveText('Missing email address.');
});

test('falls back to data.email when no form payload yet', async ({ mount, page }) => {
	await mount(VerifyEmailSentHarness, { props: { dataEmail: 'fresh@example.com' } });

	await expect(page.locator('input[name="email"]')).toHaveValue('fresh@example.com');
});
