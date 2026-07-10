import { expect, test } from '@playwright/experimental-ct-svelte';
import AdminTranslationsHarness from './AdminTranslationsHarness.svelte';

test('lists catalog keys with English source and effective Kalenjin value', async ({
	mount,
	page
}) => {
	await mount(AdminTranslationsHarness, {
		props: { overrides: [{ key: 'menu.signOut', value: 'Mang’u' }] }
	});

	// Database override wins and is badged as edited on site.
	const signOutInput = page.getByLabel('Kalenjin translation for menu.signOut');
	await expect(signOutInput).toHaveValue('Mang’u');
	await expect(
		page.locator('.trans-row', { hasText: 'menu.signOut' }).locator('.trans-badge')
	).toHaveText('edited on site');

	// Static kln.ts draft shows as prefill with a draft badge.
	const dictionaryInput = page.getByLabel('Kalenjin translation for nav.dictionary');
	await expect(dictionaryInput).toHaveValue('Kamusi');
	await expect(
		page.locator('.trans-row', { hasText: 'nav.dictionary' }).locator('.trans-badge')
	).toHaveText('code draft');

	// Untranslated keys are empty with the English text as placeholder.
	const settingsInput = page.getByLabel('Kalenjin translation for menu.settings');
	await expect(settingsInput).toHaveValue('');
	await expect(settingsInput).toHaveAttribute('placeholder', 'Settings');
	await expect(
		page.locator('.trans-row', { hasText: 'menu.settings' }).locator('.trans-badge')
	).toHaveText('English');
});

test('saving a row posts the key and new value to the save action', async ({ mount, page }) => {
	const posts: Array<Record<string, string>> = [];
	await page.route('**/*', async (route) => {
		if (route.request().method() !== 'POST') {
			await route.fallback();
			return;
		}
		posts.push(route.request().postDataJSON());
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ type: 'success', status: 200, data: { saved: 'menu.settings' } })
		});
	});

	await mount(AdminTranslationsHarness, { props: { overrides: [] } });

	const input = page.getByLabel('Kalenjin translation for menu.settings');
	await input.fill('Teretab kaa');
	await page
		.locator('.trans-row', { hasText: 'menu.settings' })
		.getByRole('button', { name: 'Save' })
		.click();

	await expect.poll(() => posts.length).toBe(1);
	expect(posts[0]).toEqual({ key: 'menu.settings', value: 'Teretab kaa' });
});

test('the filter narrows rows across key, English, and Kalenjin text', async ({
	mount,
	page
}) => {
	await mount(AdminTranslationsHarness, {
		props: { overrides: [{ key: 'menu.signOut', value: 'Mang’u' }] }
	});

	const filter = page.getByLabel('Filter translations');

	await filter.fill('sign out');
	await expect(page.locator('.trans-row')).toHaveCount(1);
	await expect(page.locator('.trans-row')).toContainText('menu.signOut');

	// Matches against the Kalenjin value too.
	await filter.fill('Mang’u');
	await expect(page.locator('.trans-row')).toHaveCount(1);
	await expect(page.locator('.trans-row')).toContainText('menu.signOut');

	await filter.fill('zzz-no-match');
	await expect(page.locator('.trans-row')).toHaveCount(0);
	await expect(page.getByText('No messages match')).toBeVisible();
});
