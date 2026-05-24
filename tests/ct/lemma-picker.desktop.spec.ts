import { expect, test } from '@playwright/experimental-ct-svelte';
import AutosaveRaceHarness from './AutosaveRaceHarness.svelte';

test('clear lemma keeps the lemma picker open', async ({ mount, page }) => {
	await page.route('**/__ct/update', async (route) => {
		const body = route.request().postDataJSON() as { tokenId?: string };

		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				type: 'success',
				data: {
					tokenUpdates: [
						{
							tokenId: body.tokenId ?? 'token-1',
							wordId: null,
							inContextTranslation: '',
							word: null
						}
					]
				}
			})
		});
	});

	const component = await mount(AutosaveRaceHarness);

	await component.getByRole('button', { name: 'kibendi' }).click();
	await expect(page.getByRole('dialog', { name: 'Link root lemma' })).toBeVisible();

	await page.getByRole('button', { name: 'Clear lemma' }).click();

	await expect(page.getByRole('dialog', { name: 'Link root lemma' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Clear lemma' })).toBeHidden();
});
