import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		// Respect the harness-assigned port when launched with PORT set.
		port: process.env.PORT ? Number(process.env.PORT) : undefined,
		fs: {
			// Allow dev server to read hoisted node_modules from the parent repo
			// when running from a git worktree under .claude/worktrees/.
			allow: ['../../..']
		}
	},
	test: {
		environment: 'node',
		include: ['src/**/*.{test,spec}.{ts,js}'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html'],
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.d.ts', 'src/**/*.{test,spec}.ts']
		}
	}
});
