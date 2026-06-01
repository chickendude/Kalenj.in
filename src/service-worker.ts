/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

// `self` is the service worker global scope, not a window.
const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `kalenjin-cache-${version}`;
const OFFLINE_URL = '/offline.html';

// Content-hashed build assets are immutable, so they're safe to cache forever;
// the small static files (icons, manifest, offline page) are cached too so the
// app shell and the offline fallback are available without a network round
// trip. Actual pages and data always go to the network (see `fetch` below).
const PRECACHE = [...build, ...files];
const PRECACHE_PATHS = new Set(PRECACHE);

sw.addEventListener('install', (event) => {
	// Take over as soon as the new shell is cached so updates don't wait for
	// every tab to close — content is network-first anyway, so there's no risk
	// of serving stale pages.
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(PRECACHE))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	// Drop caches from previous deploys and start controlling open clients.
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('fetch', (event) => {
	const { request } = event;

	if (request.method !== 'GET') return;

	const url = new URL(request.url);

	// Leave cross-origin requests (Google Fonts, etc.) to the browser.
	if (url.origin !== sw.location.origin) return;

	// Immutable build/static assets → cache-first.
	if (PRECACHE_PATHS.has(url.pathname)) {
		event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
		return;
	}

	// Page navigations → network-first, falling back to the offline page so a
	// dropped connection shows our branded screen instead of the browser error.
	if (request.mode === 'navigate') {
		event.respondWith(
			fetch(request).catch(async () => {
				const offline = await caches.match(OFFLINE_URL);
				return offline ?? Response.error();
			})
		);
		return;
	}

	// Everything else (API/data) → straight to the network, never cached.
});
