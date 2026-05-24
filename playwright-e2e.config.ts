import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 5180);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: false,
	workers: 1,
	reporter: 'list',
	use: {
		baseURL: BASE_URL,
		trace: 'on-first-retry'
	},
	projects: [
		{
			name: 'chromium',
			use: devices['Desktop Chrome']
		}
	],
	webServer: {
		command: `npx vite dev --host 127.0.0.1 --port ${PORT} --strictPort`,
		url: `${BASE_URL}/login`,
		reuseExistingServer: !process.env.CI,
		stdout: 'pipe',
		stderr: 'pipe',
		timeout: 120_000
	}
});
