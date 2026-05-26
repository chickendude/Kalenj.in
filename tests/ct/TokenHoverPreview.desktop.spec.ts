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

test('desktop opens linked tokens directly and omits the mobile entry icon', async ({
	mount,
	page
}) => {
	const component = await mount(TokenHoverPreviewHarness, {
		props: {
			sentenceText: 'Ngunon achobe',
			tokens
		}
	});
	const token = component.getByRole('link', { name: /^Ngunon/ });

	await token.hover();
	await expect(page.getByRole('tooltip')).toContainText('now');
	await expect(
		component.getByRole('link', { name: 'Open dictionary entry for Ngunon', exact: true })
	).toHaveCount(0);

	await token.click();
	await expect(page).toHaveURL(/\/dictionary\/ngunon$/);
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
