import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { serializeKlnCatalog, writeKlnCatalog, type KlnCatalog } from './kln-catalog-file';
import { kln } from '$lib/i18n/messages/kln';
import { en } from '$lib/i18n/messages/en';

describe('serializeKlnCatalog', () => {
	it('emits entries in the en.ts key order with project quoting', () => {
		const out = serializeKlnCatalog({
			'search.placeholder': "Cheng' ng'olyot…",
			'nav.dictionary': 'Tikshenari'
		});
		// nav.dictionary comes before search.placeholder in en.ts.
		expect(out.indexOf("'nav.dictionary'")).toBeLessThan(out.indexOf("'search.placeholder'"));
		// Values with apostrophes switch to double quotes, like prettier.
		expect(out).toContain(`'nav.dictionary': 'Tikshenari'`);
		expect(out).toContain(`'search.placeholder': "Cheng' ng'olyot…"`);
	});

	it('escapes backslashes, double quotes, and newlines', () => {
		const out = serializeKlnCatalog({
			'nav.dictionary': `a\\b "c"' d\ne`
		} as KlnCatalog);
		expect(out).toContain(`'nav.dictionary': "a\\\\b \\"c\\"' d\\ne"`);
	});

	it('drops keys that no longer exist in the en catalog', () => {
		const catalog = { 'nav.dictionary': 'Tikshenari', 'gone.key': 'x' } as KlnCatalog;
		const out = serializeKlnCatalog(catalog);
		expect(out).toContain('nav.dictionary');
		expect(out).not.toContain('gone.key');
	});

	it('serializes an empty catalog to a valid module', () => {
		const out = serializeKlnCatalog({});
		expect(out).toContain('export const kln: Partial<Record<MessageKey, string>> = {};');
	});

	it('round-trips the current kln.ts catalog byte-for-byte', async () => {
		// The serializer owns the file format; the committed kln.ts must match
		// what it would generate, so editor saves produce minimal diffs.
		const committed = await readFile(
			path.resolve(process.cwd(), 'src/lib/i18n/messages/kln.ts'),
			'utf8'
		);
		expect(serializeKlnCatalog(kln)).toBe(committed);
	});
});

describe('writeKlnCatalog', () => {
	let dir: string;

	afterAll(async () => {
		if (dir) await rm(dir, { recursive: true, force: true });
	});

	it('writes a module that contains every provided key', async () => {
		dir = await mkdtemp(path.join(tmpdir(), 'kln-catalog-'));
		const target = path.join(dir, 'kln.ts');
		const catalog: KlnCatalog = { 'nav.corpus': 'Tinwek', 'menu.signOut': "Mang'u" };
		await writeKlnCatalog(catalog, target);
		const written = await readFile(target, 'utf8');
		expect(written).toBe(serializeKlnCatalog(catalog));
		expect(written).toContain(`'nav.corpus': 'Tinwek'`);
		expect(written).toContain(`'menu.signOut': "Mang'u"`);
		expect(Object.keys(en).length).toBeGreaterThan(0);
	});
});
