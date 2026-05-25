import { expect, test } from '@playwright/experimental-ct-svelte';
import SidePanelHarness from './SidePanelHarness.svelte';

test('renders the title as an h3 inside the side-card wrapper', async ({ mount, page }) => {
	await mount(SidePanelHarness, { props: { title: 'Pronunciation' } });

	const heading = page.getByRole('heading', { level: 3, name: 'Pronunciation' });
	await expect(heading).toBeVisible();
	await expect(page.locator('.side-card > .side-card-head > h3')).toHaveText('Pronunciation');
});

test('renders the slot content beside the heading', async ({ mount, page }) => {
	await mount(SidePanelHarness, { props: { title: 'Pronunciation' } });

	await expect(page.getByTestId('slot-content')).toHaveText('Slot body');
	await expect(page.locator('.side-card')).toContainText('Slot body');
});

test('appends an extra class without clobbering side-card', async ({ mount, page }) => {
	await mount(SidePanelHarness, {
		props: { title: 'CEFR', extraClass: 'cefr-sidebar' }
	});

	const panel = page.locator('.side-card');
	await expect(panel).toHaveClass(/side-card/);
	await expect(panel).toHaveClass(/cefr-sidebar/);
});
