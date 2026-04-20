import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('$app/environment', () => ({ browser: true }));

type ThemeModule = typeof import('./theme');

function setupDom(opts: { stored?: 'light' | 'dark'; prefersDark?: boolean; domTheme?: 'light' | 'dark' } = {}) {
	const storage: Record<string, string> = {};
	if (opts.stored) storage['theme'] = opts.stored;

	vi.stubGlobal('localStorage', {
		getItem: (k: string) => (k in storage ? storage[k] : null),
		setItem: (k: string, v: string) => {
			storage[k] = v;
		},
		removeItem: (k: string) => {
			delete storage[k];
		}
	});

	const dataset: Record<string, string> = {};
	if (opts.domTheme) dataset.theme = opts.domTheme;
	vi.stubGlobal('document', { documentElement: { dataset } });

	vi.stubGlobal('window', {
		matchMedia: (_q: string) => ({ matches: !!opts.prefersDark })
	});

	return { storage, dataset };
}

async function loadThemeModule(): Promise<ThemeModule> {
	vi.resetModules();
	return (await import('./theme')) as ThemeModule;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('theme store', () => {
	describe('setTheme', () => {
		it('writes dataset, persists to localStorage, and updates store', async () => {
			const { storage, dataset } = setupDom();
			const { setTheme, theme } = await loadThemeModule();

			setTheme('dark');

			expect(dataset.theme).toBe('dark');
			expect(storage.theme).toBe('dark');
			expect(get(theme)).toBe('dark');
		});

		it('switches back to light', async () => {
			const { storage, dataset } = setupDom({ domTheme: 'dark' });
			const { setTheme, theme } = await loadThemeModule();

			setTheme('light');

			expect(dataset.theme).toBe('light');
			expect(storage.theme).toBe('light');
			expect(get(theme)).toBe('light');
		});
	});

	describe('toggleTheme', () => {
		it('flips from light to dark when DOM is light', async () => {
			const { dataset } = setupDom({ domTheme: 'light' });
			const { toggleTheme } = await loadThemeModule();

			toggleTheme();

			expect(dataset.theme).toBe('dark');
		});

		it('flips from dark to light when DOM is dark', async () => {
			const { dataset } = setupDom({ domTheme: 'dark' });
			const { toggleTheme } = await loadThemeModule();

			toggleTheme();

			expect(dataset.theme).toBe('light');
		});

		it('reads DOM each time (not store) so pre-paint script is authoritative', async () => {
			const { dataset } = setupDom({ domTheme: 'dark' });
			const { toggleTheme, theme } = await loadThemeModule();

			dataset.theme = 'light';
			toggleTheme();

			expect(dataset.theme).toBe('dark');
			expect(get(theme)).toBe('dark');
		});
	});

	describe('initTheme', () => {
		it('applies stored theme when localStorage has a value', async () => {
			const { dataset } = setupDom({ stored: 'dark' });
			const { initTheme } = await loadThemeModule();

			initTheme();

			expect(dataset.theme).toBe('dark');
		});

		it('prefers stored value over OS setting', async () => {
			const { dataset } = setupDom({ stored: 'light', prefersDark: true });
			const { initTheme } = await loadThemeModule();

			initTheme();

			expect(dataset.theme).toBe('light');
		});

		it('falls back to OS dark preference', async () => {
			const { dataset } = setupDom({ prefersDark: true });
			const { initTheme } = await loadThemeModule();

			initTheme();

			expect(dataset.theme).toBe('dark');
		});

		it('falls back to light when neither stored nor OS dark', async () => {
			const { dataset } = setupDom();
			const { initTheme } = await loadThemeModule();

			initTheme();

			expect(dataset.theme).toBe('light');
		});

		it('ignores invalid stored values', async () => {
			const { dataset } = setupDom({ prefersDark: true });
			const { initTheme } = await loadThemeModule();
			localStorage.setItem('theme', 'neon');

			initTheme();

			expect(dataset.theme).toBe('dark');
		});
	});

	describe('store initial value', () => {
		it('reflects the DOM theme at import time (browser)', async () => {
			setupDom({ domTheme: 'dark' });
			const { theme } = await loadThemeModule();

			expect(get(theme)).toBe('dark');
		});

		it('defaults to light when DOM has no theme attr', async () => {
			setupDom();
			const { theme } = await loadThemeModule();

			expect(get(theme)).toBe('light');
		});
	});
});

describe('theme store under SSR', () => {
	beforeEach(() => {
		vi.doMock('$app/environment', () => ({ browser: false }));
	});

	afterEach(() => {
		vi.doUnmock('$app/environment');
	});

	it('returns light without touching DOM or localStorage', async () => {
		vi.resetModules();
		const { theme, setTheme, toggleTheme, initTheme } = (await import('./theme')) as ThemeModule;

		expect(get(theme)).toBe('light');

		expect(() => setTheme('dark')).not.toThrow();
		expect(() => toggleTheme()).not.toThrow();
		expect(() => initTheme()).not.toThrow();

		expect(get(theme)).toBe('light');
	});
});
