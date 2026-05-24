import { expect, test } from '@playwright/experimental-ct-svelte';
import type { Page } from 'playwright/test';
import DictionaryPage from '../../src/routes/dictionary/+page.svelte';

const editorUser = {
	id: 'u1',
	username: 'editor',
	displayName: null,
	role: 'ADMIN',
	themePreference: 'auto'
} as const;

const data = {
	query: '',
	language: 'kalenjin' as const,
	pos: '',
	missing: '' as const,
	words: [],
	totalCount: 0,
	user: editorUser
};

async function stubDictionaryRequests(page: Page, postUrls: string[] = []) {
	await page.route('**/dictionary/search?**', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ results: [] })
		});
	});
	await page.route('**/*', async (route) => {
		const request = route.request();
		if (request.method() !== 'POST') {
			await route.fallback();
			return;
		}

		postUrls.push(request.url());
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				type: 'failure',
				data: { error: 'Submitted unexpectedly.' }
			})
		});
	});
}

test('switching the add-word split action does not submit the form', async ({ mount, page }) => {
	const postUrls: string[] = [];
	await stubDictionaryRequests(page, postUrls);

	const component = await mount(DictionaryPage, { props: { data, form: null } });

	await component.getByRole('button', { name: 'Add new word' }).click();
	await expect(page.getByRole('dialog', { name: 'Add dictionary word' })).toBeVisible();

	await page.getByLabel('Kalenjin', { exact: true }).fill('codextestword');
	await page.getByRole('button', { name: 'Choose create action' }).click();
	await page.getByRole('menuitemradio', { name: 'Create & open' }).click();

	await expect(page.getByRole('button', { name: 'Create & open' })).toBeVisible();
	await expect(page.getByRole('dialog', { name: 'Add dictionary word' })).toBeVisible();
	expect(postUrls).toEqual([]);
	await expect(page.getByText('Submitted unexpectedly.')).toHaveCount(0);
});

test('Escape closes the add-word dialog when no text input has focus', async ({ mount, page }) => {
	await stubDictionaryRequests(page);

	const component = await mount(DictionaryPage, { props: { data, form: null } });

	await component.getByRole('button', { name: 'Add new word' }).click();
	await expect(page.getByRole('dialog', { name: 'Add dictionary word' })).toBeVisible();

	await page.keyboard.press('Escape');

	await expect(page.getByRole('dialog', { name: 'Add dictionary word' })).toHaveCount(0);
});
