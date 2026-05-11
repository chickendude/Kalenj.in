import { expect, test } from '@playwright/experimental-ct-svelte';
import type { ComponentFixtures } from '@playwright/experimental-ct-svelte';
import type { Page } from 'playwright/test';
import TokenHoverPreviewHarness from './TokenHoverPreviewHarness.svelte';

const tokens = [
	{
		id: 'token-ngunon',
		tokenOrder: 0,
		surfaceForm: 'Ngunon',
		word: { id: 'word-ngunon', kalenjin: 'Ngunon', translations: 'now' }
	},
	{
		id: 'token-achobe',
		tokenOrder: 1,
		surfaceForm: 'achobe',
		word: { id: 'word-achobe', kalenjin: 'achobe', translations: 'make' }
	},
	{
		id: 'token-igiilge',
		tokenOrder: 2,
		surfaceForm: 'Igiilge',
		word: { id: 'word-igiilge', kalenjin: 'Igiilge', translations: 'work hard' }
	}
];

async function mountPreview(
	mount: ComponentFixtures['mount'],
	options: { containerStyle?: string } = {}
) {
	return mount(TokenHoverPreviewHarness, {
		props: {
			containerStyle: options.containerStyle,
			sentenceText: 'Ngunon achobe Igiilge',
			tokens
		}
	});
}

async function expectTooltipWithinViewport(page: Page) {
	const viewport = page.viewportSize();
	expect(viewport).not.toBeNull();

	await expect
		.poll(async () => {
			const box = await page.getByRole('tooltip').boundingBox();
			return box?.x ?? Number.NEGATIVE_INFINITY;
		})
		.toBeGreaterThanOrEqual(11);

	await expect
		.poll(async () => {
			const box = await page.getByRole('tooltip').boundingBox();
			return box ? box.x + box.width : Number.POSITIVE_INFINITY;
		})
		.toBeLessThanOrEqual(viewport!.width - 11);
}

test('mobile taps show one preview with a full-entry affordance', async ({ mount, page }) => {
	const component = await mountPreview(mount);

	await component.getByRole('link', { name: /^Ngunon$/ }).click();
	await expect(page).not.toHaveURL(/\/dictionary\//);
	await expect(page.getByRole('tooltip')).toContainText('now');
	await expect(
		component.getByRole('link', { name: 'Open dictionary entry for Ngunon', exact: true })
	).toBeVisible();

	await component.getByRole('link', { name: /^Igiilge$/ }).click();
	await expect(page.getByRole('tooltip')).toHaveCount(1);
	await expect(page.getByRole('tooltip')).toContainText('work hard');
	await expect(page.getByRole('tooltip')).not.toContainText('now');
});

test('mobile previews stay onscreen and remain centered when there is room', async ({
	mount,
	page
}) => {
	let component = await mountPreview(mount);
	await component.getByRole('link', { name: /^Ngunon$/ }).click();

	await expectTooltipWithinViewport(page);

	await component.unmount();
	component = await mountPreview(mount, { containerStyle: 'margin-left: 315px; width: 70px;' });

	await component.getByRole('link', { name: /^Ngunon$/ }).click();
	await expectTooltipWithinViewport(page);

	await component.unmount();
	component = await mountPreview(mount, { containerStyle: 'margin-left: 150px; width: 220px;' });

	const centeredToken = component.getByRole('link', { name: /^Ngunon$/ });
	const centeredTokenBox = await centeredToken.boundingBox();
	await centeredToken.click();
	const centeredTooltip = await page.getByRole('tooltip').boundingBox();
	expect(centeredTooltip).not.toBeNull();
	expect(centeredTokenBox).not.toBeNull();

	const tooltipCenter = centeredTooltip!.x + centeredTooltip!.width / 2;
	const tokenCenter = centeredTokenBox!.x + centeredTokenBox!.width / 2;
	expect(Math.abs(tooltipCenter - tokenCenter)).toBeLessThanOrEqual(2);
});
