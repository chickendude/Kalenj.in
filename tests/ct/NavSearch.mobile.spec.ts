import { expect, test } from '@playwright/experimental-ct-svelte';
import type { Page } from 'playwright/test';
import NavSearchHarness from './NavSearchHarness.svelte';

const SEARCH_ROUTE = '**/dictionary/search?q=*';

const sampleResults = [
	{
		id: 'word-ak',
		kalenjin: 'ak',
		pluralForm: null,
		translations: 'and; with',
		partOfSpeech: null
	},
	{
		id: 'word-kany',
		kalenjin: 'kany',
		pluralForm: null,
		translations: 'to wait',
		partOfSpeech: 'VERB'
	},
	{
		id: 'word-age',
		kalenjin: 'age',
		pluralForm: null,
		translations: 'another',
		partOfSpeech: null
	}
];

async function stubSearch(page: Page) {
	await page.route(SEARCH_ROUTE, async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ results: sampleResults })
		});
	});
}

test('search dropdown is wide enough to be readable on narrow phones', async ({ mount, page }) => {
	// Pixel 5 (the mobile project) is ~393px wide; squeeze to 320px to exercise
	// the worst real-world case the review flagged (dropdown at ~133px).
	await page.setViewportSize({ width: 320, height: 700 });
	await stubSearch(page);

	const component = await mount(NavSearchHarness);

	const input = component.getByRole('combobox', { name: 'Search the dictionary' });
	await input.click();
	await input.fill('ak');

	const dropdown = page.locator('#nav-search-menu');
	await expect(dropdown).toBeVisible();

	const dropdownBox = await dropdown.boundingBox();
	expect(dropdownBox).not.toBeNull();

	// On a 320px viewport the dropdown should fill most of the width, not the
	// cramped input slot. Picking 280 leaves room for the 8px gutters we apply.
	expect(dropdownBox!.width).toBeGreaterThanOrEqual(280);

	// And it should clearly outgrow the input itself — the original bug was that
	// the dropdown inherited the squeezed input width.
	const inputBox = await input.boundingBox();
	expect(inputBox).not.toBeNull();
	expect(dropdownBox!.width).toBeGreaterThan(inputBox!.width + 40);
});

test('search dropdown also breaks out at the top of the mobile range', async ({ mount, page }) => {
	// 720px sits at the original side-menu breakpoint, where logged-in users
	// previously got the worst squeeze. Confirm the fix holds here too.
	await page.setViewportSize({ width: 720, height: 800 });
	await stubSearch(page);

	const component = await mount(NavSearchHarness);

	const input = component.getByRole('combobox', { name: 'Search the dictionary' });
	await input.click();
	await input.fill('ak');

	const dropdown = page.locator('#nav-search-menu');
	await expect(dropdown).toBeVisible();

	const dropdownBox = await dropdown.boundingBox();
	expect(dropdownBox).not.toBeNull();

	// 720 - 16px of gutters = 704. Allow some slack for borders/scrollbars.
	expect(dropdownBox!.width).toBeGreaterThanOrEqual(680);
});
