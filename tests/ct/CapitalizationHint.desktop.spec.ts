import { expect, test } from '@playwright/experimental-ct-svelte';
import CapitalizationHintHarness from './CapitalizationHintHarness.svelte';

test('hint mode stays hidden for lowercase values', async ({ mount, page }) => {
	await mount(CapitalizationHintHarness, { props: { initialValue: 'chumoyot' } });

	await expect(page.getByRole('button', { name: 'Make lowercase' })).toHaveCount(0);
});

test('hint mode lowercases the whole value on click', async ({ mount, page }) => {
	await mount(CapitalizationHintHarness, { props: { initialValue: 'Theft, Stealing from Nandi' } });

	await page.getByRole('button', { name: 'Make lowercase' }).click();

	await expect(page.getByLabel('Word')).toHaveValue('theft, stealing from nandi');
	await expect(page.getByRole('button', { name: 'Make lowercase' })).toHaveCount(0);
});

test('hint mode reacts to typing', async ({ mount, page }) => {
	await mount(CapitalizationHintHarness, { props: { initialValue: '' } });

	await page.getByLabel('Word').fill('Kimol');
	await expect(page.getByRole('button', { name: 'Make lowercase' })).toBeVisible();

	await page.getByLabel('Word').fill('kimol');
	await expect(page.getByRole('button', { name: 'Make lowercase' })).toHaveCount(0);
});

test('hint mode stays hidden when suppressed for NAME entries', async ({ mount, page }) => {
	await mount(CapitalizationHintHarness, { props: { initialValue: 'Kipchoge', suppress: true } });

	await expect(page.getByRole('button', { name: 'Make lowercase' })).toHaveCount(0);
});

test('auto mode lowercases everything as you type and restores the typed form', async ({
	mount,
	page
}) => {
	await mount(CapitalizationHintHarness, { props: { auto: true } });

	const input = page.getByLabel('Word');
	await input.pressSequentially('Dance from Nandi');

	await expect(input).toHaveValue('dance from nandi');
	await expect(page.getByText('Lowercased 2 letters.')).toBeVisible();

	await page.getByRole('button', { name: 'Restore capitals' }).click();
	await expect(input).toHaveValue('Dance from Nandi');
	await expect(page.getByRole('button', { name: 'Restore capitals' })).toHaveCount(0);
});

test('auto mode keeps lowercasing edits until capitals are restored', async ({ mount, page }) => {
	await mount(CapitalizationHintHarness, { props: { auto: true } });

	const input = page.getByLabel('Word');
	await input.pressSequentially('Thursday');
	await expect(input).toHaveValue('thursday');

	await input.fill('Thursday');
	await expect(input).toHaveValue('thursday');

	await page.getByRole('button', { name: 'Restore capitals' }).click();
	await expect(input).toHaveValue('Thursday');

	await input.fill('Thursday Market');
	await expect(input).toHaveValue('Thursday Market');
});

test('auto mode restores capitals typed across separate edits', async ({ mount, page }) => {
	await mount(CapitalizationHintHarness, { props: { auto: true } });

	const input = page.getByLabel('Word');
	await input.pressSequentially('Glass, Mirror');
	await expect(input).toHaveValue('glass, mirror');

	await page.getByRole('button', { name: 'Restore capitals' }).click();
	await expect(input).toHaveValue('Glass, Mirror');
});

test('auto mode resets after the field is cleared', async ({ mount, page }) => {
	await mount(CapitalizationHintHarness, { props: { auto: true } });

	const input = page.getByLabel('Word');
	await input.pressSequentially('Kimol');
	await expect(input).toHaveValue('kimol');

	await input.fill('');
	await input.pressSequentially('Chebet');
	await expect(input).toHaveValue('chebet');
	await expect(page.getByText('Lowercased 1 letter.')).toBeVisible();
});

test('auto mode does nothing when suppressed', async ({ mount, page }) => {
	await mount(CapitalizationHintHarness, {
		props: { auto: true, suppress: true, initialValue: 'Kipchoge' }
	});

	await expect(page.getByLabel('Word')).toHaveValue('Kipchoge');
	await expect(page.getByRole('button', { name: 'Restore capitals' })).toHaveCount(0);
});
