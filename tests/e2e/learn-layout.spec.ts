import { expect, test } from '@playwright/test';

test('lesson fill-in hint stays centered on its underline after layout settles', async ({
	page
}) => {
	await page.goto('/learn/lesson-2');
	await page.getByRole('button', { name: 'Next' }).click();
	await page.getByRole('button', { name: 'Next' }).click();

	await expect(page.getByText('FILL IN THE BLANK')).toBeVisible();
	await page.waitForTimeout(1000);

	await expect(page.locator('.slots-label-text')).toHaveCount(0);

	const layout = await page.evaluate(() => {
		const underline = document.querySelector('.slot-word')?.getBoundingClientRect();
		const labelEl = document.querySelector('.label-line:not(.sub-label)') as HTMLElement | null;
		const label = labelEl?.getBoundingClientRect();

		if (!underline || !label || !labelEl) {
			throw new Error('Expected fill-in-blank underline and label to render.');
		}

		return {
			underlineCenter: underline.left + underline.width / 2,
			labelCenter: label.left + label.width / 2,
			verticalGap: label.top - underline.bottom,
			labelInlineTransform: labelEl.style.transform
		};
	});

	expect(layout.labelInlineTransform).toBe('');
	expect(Math.abs(layout.labelCenter - layout.underlineCenter)).toBeLessThanOrEqual(1);
	expect(layout.verticalGap).toBeGreaterThanOrEqual(0);
	expect(layout.verticalGap).toBeLessThanOrEqual(8);
});
