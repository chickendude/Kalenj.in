import { expect, test } from '@playwright/experimental-ct-svelte';
import VerifyEmailFailedHarness from './VerifyEmailFailedHarness.svelte';

test('expired token tells the user to sign in for a fresh one', async ({ mount, page }) => {
	await mount(VerifyEmailFailedHarness, { props: { reason: 'expired' } });

	await expect(page.getByRole('heading', { name: 'Verification failed' })).toBeVisible();
	await expect(page.getByText('This link has expired.')).toBeVisible();
	await expect(page.getByRole('link', { name: 'create a new account' })).toHaveAttribute(
		'href',
		'/signup'
	);
});

test('invalid token tells the user the link is invalid or already used', async ({
	mount,
	page
}) => {
	await mount(VerifyEmailFailedHarness, { props: { reason: 'invalid' } });

	await expect(
		page.getByText('This verification link is invalid or has already been used.')
	).toBeVisible();
	await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
});
