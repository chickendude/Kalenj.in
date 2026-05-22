import { expect, test } from '@playwright/experimental-ct-svelte';
import BulkAudioWaveformHarness from './BulkAudioWaveformHarness.svelte';

test('renders one bar per amplitude value', async ({ mount, page }) => {
	await mount(BulkAudioWaveformHarness, { props: { bars: [0.2, 0.4, 0.6, 0.8, 1] } });

	await expect(page.locator('.waveform .bar')).toHaveCount(5);
});

test('marks bars up to the progress point as played only while playing', async ({ mount, page }) => {
	await mount(BulkAudioWaveformHarness, {
		props: { bars: [0.5, 0.5, 0.5, 0.5], playing: true, progress: 0.5 }
	});

	// bi/4 <= 0.5 -> indices 0,1,2 are played; index 3 (0.75) is not.
	await expect(page.locator('.waveform .bar.played')).toHaveCount(3);
});

test('does not mark any bar played when not playing', async ({ mount, page }) => {
	await mount(BulkAudioWaveformHarness, {
		props: { bars: [0.5, 0.5, 0.5, 0.5], playing: false, progress: 0.9 }
	});

	await expect(page.locator('.waveform .bar.played')).toHaveCount(0);
});

test('reflects progress in aria-valuenow only while playing', async ({ mount, page }) => {
	await mount(BulkAudioWaveformHarness, {
		props: { bars: [0.5, 0.5], playing: true, progress: 0.42 }
	});
	await expect(page.locator('.waveform')).toHaveAttribute('aria-valuenow', '42');

	await mount(BulkAudioWaveformHarness, {
		props: { bars: [0.5, 0.5], playing: false, progress: 0.42 }
	});
	await expect(page.locator('.waveform').last()).toHaveAttribute('aria-valuenow', '0');
});

test('arrow keys seek by 0.05, clamped to [0,1]', async ({ mount, page }) => {
	await mount(BulkAudioWaveformHarness, {
		props: { bars: [0.5, 0.5], playing: true, progress: 0.2 }
	});

	const waveform = page.locator('.waveform');
	await waveform.focus();

	await waveform.press('ArrowRight');
	await expect(page.getByTestId('last-seek')).toHaveText('0.25');

	await waveform.press('ArrowLeft');
	await expect(page.getByTestId('last-seek')).toHaveText('0.15000000000000002');
});

test('clicking the waveform reports a seek fraction in [0,1]', async ({ mount, page }) => {
	await mount(BulkAudioWaveformHarness, { props: { bars: [0.5, 0.5, 0.5, 0.5] } });

	await page.locator('.waveform').click();

	const text = await page.getByTestId('last-seek').textContent();
	const value = Number(text);
	expect(Number.isFinite(value)).toBe(true);
	expect(value).toBeGreaterThanOrEqual(0);
	expect(value).toBeLessThanOrEqual(1);
});
