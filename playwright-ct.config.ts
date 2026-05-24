import { defineConfig, devices } from '@playwright/experimental-ct-svelte';
import { resolve } from 'node:path';

export default defineConfig({
	testDir: './tests/ct',
	fullyParallel: true,
	reporter: 'list',
	use: {
		trace: 'on-first-retry',
		ctViteConfig: {
			resolve: {
				alias: {
					$lib: resolve(import.meta.dirname, 'src/lib'),
					'$app/environment': resolve(
						import.meta.dirname,
						'tests/ct/stubs/app-environment.ts'
					),
					'$app/forms': resolve(import.meta.dirname, 'tests/ct/stubs/app-forms.ts'),
					'$app/navigation': resolve(
						import.meta.dirname,
						'tests/ct/stubs/app-navigation.ts'
					),
					'$app/state': resolve(import.meta.dirname, 'tests/ct/stubs/app-state.ts')
				}
			}
		}
	},
	projects: [
		{
			name: 'desktop-chromium',
			testMatch: /.*\.desktop\.spec\.ts/,
			use: {
				...devices['Desktop Chrome'],
				viewport: { width: 800, height: 600 }
			}
		},
		{
			name: 'mobile-chromium',
			testMatch: /.*\.mobile\.spec\.ts/,
			use: {
				...devices['Pixel 5']
			}
		}
	]
});
