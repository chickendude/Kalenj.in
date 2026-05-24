import { expect, test } from '@playwright/experimental-ct-svelte';
import SignupPageHarness from './SignupPageHarness.svelte';

test('posts to /signup with required username/email/password fields', async ({ mount, page }) => {
	await mount(SignupPageHarness, { props: {} });

	const form = page.locator('form');
	await expect(form).toHaveAttribute('method', 'POST');

	await expect(page.locator('#username')).toHaveAttribute('required', '');
	await expect(page.locator('#email')).toHaveAttribute('required', '');
	await expect(page.locator('#email')).toHaveAttribute('type', 'email');
	await expect(page.locator('#password')).toHaveAttribute('required', '');
	await expect(page.locator('#password')).toHaveAttribute('minlength', '12');
	await expect(page.locator('#confirmPassword')).toHaveAttribute('required', '');
	// Display name is optional.
	await expect(page.locator('#displayName')).not.toHaveAttribute('required', '');
});

test('password show/hide toggle flips the input type for both password fields', async ({
	mount,
	page
}) => {
	await mount(SignupPageHarness, { props: {} });

	await expect(page.locator('#password')).toHaveAttribute('type', 'password');
	await expect(page.locator('#confirmPassword')).toHaveAttribute('type', 'password');

	await page.getByRole('button', { name: 'Show password' }).click();

	await expect(page.locator('#password')).toHaveAttribute('type', 'text');
	await expect(page.locator('#confirmPassword')).toHaveAttribute('type', 'text');
	await expect(page.getByRole('button', { name: 'Hide password' })).toBeVisible();

	await page.getByRole('button', { name: 'Hide password' }).click();

	await expect(page.locator('#password')).toHaveAttribute('type', 'password');
	await expect(page.locator('#confirmPassword')).toHaveAttribute('type', 'password');
});

test('echoes back submitted values and an error banner on validation failure', async ({
	mount,
	page
}) => {
	await mount(SignupPageHarness, {
		props: {
			formUsername: 'someone',
			formEmail: 'someone@example.com',
			formDisplayName: 'Some One',
			formError: 'Password and confirmation do not match.'
		}
	});

	await expect(page.locator('#username')).toHaveValue('someone');
	await expect(page.locator('#email')).toHaveValue('someone@example.com');
	await expect(page.locator('#displayName')).toHaveValue('Some One');
	await expect(page.locator('.form-feedback.error')).toHaveText(
		'Password and confirmation do not match.'
	);
});

test('cross-links to the login page', async ({ mount, page }) => {
	await mount(SignupPageHarness, { props: {} });

	await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
});

test('redirectTo is preserved through a hidden input', async ({ mount, page }) => {
	await mount(SignupPageHarness, { props: { redirectTo: '/lessons/42' } });

	await expect(page.locator('input[name="redirectTo"]')).toHaveValue('/lessons/42');
});
