import { expect, test } from '@playwright/experimental-ct-svelte';
import TokenHoverPreviewHarness from './TokenHoverPreviewHarness.svelte';

const tokens = [
	{
		id: 'token-ngunon',
		tokenOrder: 0,
		surfaceForm: 'Ngunon',
		word: { id: 'word-ngunon', kalenjin: 'Ngunon', slug: 'ngunon', translations: 'now' }
	},
	{
		id: 'token-achobe',
		tokenOrder: 1,
		surfaceForm: 'achobe',
		word: { id: 'word-achobe', kalenjin: 'achobe', slug: 'achobe', translations: 'make' }
	}
];

test('desktop opens linked tokens directly and links the entry inside the popup', async ({
	mount,
	page
}) => {
	const component = await mount(TokenHoverPreviewHarness, {
		props: {
			sentenceText: 'Ngunon achobe',
			tokens
		}
	});
	// Once the tooltip is visible its lemma-line anchor also matches /^Ngunon/,
	// so pin the locator to the outer token element.
	const token = component.getByRole('link', { name: /^Ngunon/ }).first();

	await token.hover();
	await expect(page.getByRole('tooltip')).toContainText('now');
	await expect(page.getByRole('tooltip').getByRole('link')).toHaveAttribute(
		'href',
		'/dictionary/ngunon'
	);

	await token.click();
	await expect(page).toHaveURL(/\/dictionary\/ngunon$/);
});

test('desktop keeps the popup open while the pointer moves into it', async ({ mount, page }) => {
	const component = await mount(TokenHoverPreviewHarness, {
		props: {
			sentenceText: 'Ngunon achobe',
			tokens
		}
	});
	const token = component.getByRole('link', { name: /^Ngunon/ }).first();

	await token.hover();
	const tooltip = page.getByRole('tooltip');
	await expect(tooltip).toBeVisible();
	const box = await tooltip.boundingBox();
	expect(box).not.toBeNull();

	await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
	await page.waitForTimeout(220);
	await expect(tooltip).toBeVisible();
});

test('desktop keeps the popup open when returning from popup to token', async ({ mount, page }) => {
	const component = await mount(TokenHoverPreviewHarness, {
		props: {
			sentenceText: 'Ngunon achobe',
			tokens
		}
	});
	const token = component.getByRole('link', { name: /^Ngunon/ }).first();

	await token.hover();
	const tooltip = page.getByRole('tooltip');
	await expect(tooltip).toBeVisible();
	const tooltipBox = await tooltip.boundingBox();
	const tokenBox = await token.boundingBox();
	expect(tooltipBox).not.toBeNull();
	expect(tokenBox).not.toBeNull();

	await page.mouse.move(tooltipBox!.x + tooltipBox!.width / 2, tooltipBox!.y + tooltipBox!.height / 2);
	await page.waitForTimeout(80);
	await page.mouse.move(tokenBox!.x + tokenBox!.width / 2, tokenBox!.y + tokenBox!.height / 2);
	await page.waitForTimeout(220);
	await expect(tooltip).toBeVisible();
});

test('desktop keeps the popup open over the underline hit area', async ({ mount, page }) => {
	const component = await mount(TokenHoverPreviewHarness, {
		props: {
			sentenceText: 'Ngunon achobe',
			tokens
		}
	});
	const token = component.getByRole('link', { name: /^Ngunon/ }).first();

	await token.hover();
	const tooltip = page.getByRole('tooltip');
	await expect(tooltip).toBeVisible();
	const tokenBox = await token.boundingBox();
	expect(tokenBox).not.toBeNull();

	await page.mouse.move(tokenBox!.x + tokenBox!.width / 2, tokenBox!.y + tokenBox!.height + 3);
	await page.waitForTimeout(220);
	await expect(tooltip).toBeVisible();
});

test('desktop popup content does not trigger the hovered token link', async ({ mount, page }) => {
	const component = await mount(TokenHoverPreviewHarness, {
		props: {
			sentenceText: 'Ngunon achobe',
			tokens
		}
	});
	const token = component.getByRole('link', { name: /^Ngunon/ }).first();

	await token.hover();
	const tooltip = page.getByRole('tooltip');
	await expect(tooltip).toBeVisible();
	const currentUrl = page.url();

	await tooltip.getByRole('listitem').filter({ hasText: 'now' }).click();
	await expect(page).toHaveURL(currentUrl);
});

test('desktop opens linked tokens with their stored dictionary slug', async ({ mount, page }) => {
	const component = await mount(TokenHoverPreviewHarness, {
		props: {
			sentenceText: 'Kot',
			tokens: [
				{
					id: 'token-kot',
					tokenOrder: 0,
					surfaceForm: 'Kot',
					word: { id: 'word-kot-2', kalenjin: 'kot', slug: 'kot-1', translations: 'bag' }
				}
			]
		}
	});

	await component.getByRole('link', { name: /^Kot/ }).click();
	await expect(page).toHaveURL(/\/dictionary\/kot-1$/);
});
