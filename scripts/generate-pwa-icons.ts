/**
 * Generates the PWA raster icons from the brand logo SVG.
 *
 * We have no system rasteriser (ImageMagick/rsvg/sharp), so this uses the
 * headless Chromium that ships with Playwright (already a dev dependency) to
 * render the SVG at exact pixel sizes.
 *
 * Run with: npm run pwa:icons
 * Outputs into static/icons/. Re-run if the brand logo changes.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdir } from 'node:fs/promises';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'static', 'icons');

// The brand mark (kept in sync with src/lib/assets/favicon.svg). The rounded
// `rx` gives transparent corners for the standard "any" icons; the square
// variant is full-bleed for maskable + Apple touch icons (platforms apply
// their own mask / rounding, and iOS fills transparent areas with black).
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-label="Kalenj.in">
  <defs>
    <clipPath id="c"><rect width="64" height="64" rx="10"/></clipPath>
    <linearGradient id="s" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6b8a7a"/>
      <stop offset="1" stop-color="#365e4a"/>
    </linearGradient>
  </defs>
  <g clip-path="url(#c)">
    <rect width="64" height="64" fill="url(#s)"/>
    <circle cx="48" cy="20" r="5" fill="#c47a3a"/>
    <path d="M-2 40 L8 32 L16 36 L26 30 L36 34 L48 28 L56 32 L66 30 L66 48 L-2 48 Z" fill="#1e3a2c" opacity="0.65"/>
    <g fill="#ffffff">
      <rect x="14" y="10" width="6" height="30"/>
      <polygon points="20,25 34,10 40,10 24,27"/>
      <polygon points="20,25 24,24 40,40 34,40"/>
    </g>
    <path d="M-2 48 L10 40 L22 46 L34 38 L46 44 L58 38 L66 42 L66 66 L-2 66 Z" fill="#1e3a2c"/>
    <path d="M-2 56 L18 48 L34 54 L52 46 L66 52 L66 66 L-2 66 Z" fill="#c47a3a" opacity="0.9"/>
  </g>
</svg>`;
const square = rounded.replace('rx="10"', 'rx="0"');

const targets = [
	{ svg: rounded, size: 192, file: 'icon-192.png', transparent: true },
	{ svg: rounded, size: 512, file: 'icon-512.png', transparent: true },
	{ svg: square, size: 512, file: 'icon-maskable-512.png', transparent: false },
	{ svg: square, size: 180, file: 'apple-touch-icon.png', transparent: false }
];

function pageHtml(svg: string, size: number): string {
	const sized = svg.replace('<svg ', `<svg width="${size}" height="${size}" `);
	return `<!doctype html><html><head><meta charset="utf-8"><style>
		*{margin:0;padding:0}
		html,body{width:${size}px;height:${size}px;background:transparent}
		svg{display:block;width:${size}px;height:${size}px}
	</style></head><body>${sized}</body></html>`;
}

async function main(): Promise<void> {
	await mkdir(outDir, { recursive: true });
	const browser = await chromium.launch();
	try {
		for (const t of targets) {
			const page = await browser.newPage({
				viewport: { width: t.size, height: t.size },
				deviceScaleFactor: 1
			});
			await page.setContent(pageHtml(t.svg, t.size), { waitUntil: 'networkidle' });
			await page.screenshot({ path: join(outDir, t.file), omitBackground: t.transparent });
			await page.close();
			console.log(`wrote static/icons/${t.file} (${t.size}x${t.size})`);
		}
	} finally {
		await browser.close();
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
