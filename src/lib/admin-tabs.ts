import { browser } from '$app/environment';

export type AdminTab = {
	href: string;
	label: string;
	adminOnly?: boolean;
};

export const ADMIN_TAB_STORAGE_KEY = 'admin:last-tab';

export const ADMIN_TABS: AdminTab[] = [
	{ href: '/admin/word-of-day', label: 'WOTD' },
	{ href: '/admin/cleanup', label: 'Cleanup' },
	{ href: '/admin/proofread', label: 'Proofread' },
	{ href: '/admin/word-audio', label: 'Word audio' },
	{ href: '/admin/sentence-audio', label: 'Sentence audio' },
	{ href: '/admin/duplicates', label: 'Duplicates' },
	{ href: '/admin/users', label: 'Users', adminOnly: true }
];

export const DEFAULT_ADMIN_TAB = ADMIN_TABS[0].href;

const ADMIN_TAB_PATHS = new Set(ADMIN_TABS.map((tab) => tab.href));
const ADMIN_TABS_BY_PATH = new Map(ADMIN_TABS.map((tab) => [tab.href, tab]));
const LEGACY_ADMIN_TAB_PATHS = new Map([
	['/dictionary/record-audio', '/admin/word-audio'],
	['/corpus/record-audio', '/admin/sentence-audio'],
	['/corpus/duplicates', '/admin/duplicates']
]);

export type AdminTabRole = 'ADMIN' | 'MANAGER' | string | null | undefined;

export function isAdminTabPath(pathname: string): boolean {
	return ADMIN_TAB_PATHS.has(pathname);
}

export function normalizeAdminTabHref(href: string): string | null {
	const searchStart = href.indexOf('?');
	const pathname = searchStart === -1 ? href : href.slice(0, searchStart);
	const search = searchStart === -1 ? '' : href.slice(searchStart);
	const normalizedPathname = LEGACY_ADMIN_TAB_PATHS.get(pathname) ?? pathname;
	if (!isAdminTabPath(normalizedPathname)) return null;
	return `${normalizedPathname}${search}`;
}

export function isAdminTabAllowed(href: string, role: AdminTabRole): boolean {
	const normalized = normalizeAdminTabHref(href);
	if (!normalized) return false;
	const searchStart = normalized.indexOf('?');
	const pathname = searchStart === -1 ? normalized : normalized.slice(0, searchStart);
	const tab = ADMIN_TABS_BY_PATH.get(pathname);
	return Boolean(tab && (!tab.adminOnly || role === 'ADMIN'));
}

export function fallbackAdminTabForRole(role: AdminTabRole): string {
	return ADMIN_TABS.find((tab) => !tab.adminOnly || role === 'ADMIN')?.href ?? DEFAULT_ADMIN_TAB;
}

export function rememberAdminTabPath(href: string) {
	if (!browser) return;
	const normalized = normalizeAdminTabHref(href);
	if (!normalized) return;
	try {
		localStorage.setItem(ADMIN_TAB_STORAGE_KEY, normalized);
	} catch {
		// Storage can throw in private browsing modes or when quota is exceeded.
	}
}

export function getRememberedAdminTabPath(): string {
	if (!browser) return DEFAULT_ADMIN_TAB;
	try {
		return normalizeAdminTabHref(localStorage.getItem(ADMIN_TAB_STORAGE_KEY) ?? '') ?? DEFAULT_ADMIN_TAB;
	} catch {
		return DEFAULT_ADMIN_TAB;
	}
}
