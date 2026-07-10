import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { en, type MessageKey } from '$lib/i18n/messages/en';

/** A full Kalenjin catalog: key → translated text. */
export type KlnCatalog = Partial<Record<MessageKey, string>>;

// Resolved from the project root, where `vite dev` runs. Only meaningful in
// development — a production build has no source tree to write to, so the
// save action guards on `dev` before calling writeKlnCatalog.
const CATALOG_PATH = path.resolve(process.cwd(), 'src/lib/i18n/messages/kln.ts');

const HEADER = `import type { MessageKey } from './en';

/**
 * Kalenjin UI messages. Any key missing here falls back to English, so this
 * catalog can be filled in incrementally.
 *
 * This file is the single source of the Kalenjin text. Edit it at
 * /admin/translations while running the site locally (which rewrites this
 * file) or by hand, then commit the changes — they ship with the code.
 * Have a fluent speaker review entries before treating them as authoritative.
 */
export const kln: Partial<Record<MessageKey, string>> = {`;

// Prefer single quotes (the project style); fall back to double quotes when
// the value contains a single quote, as prettier would.
function quote(text: string): string {
	const escaped = text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
	if (escaped.includes("'")) {
		return `"${escaped.replace(/"/g, '\\"')}"`;
	}
	return `'${escaped}'`;
}

/**
 * Render the full contents of kln.ts for a catalog. Entries follow the key
 * order of the English source catalog (stable diffs); unknown keys are
 * dropped.
 */
export function serializeKlnCatalog(catalog: KlnCatalog): string {
	const entries = (Object.keys(en) as MessageKey[])
		.filter((key) => catalog[key] !== undefined)
		.map((key) => `\t${quote(key)}: ${quote(catalog[key] as string)}`);
	if (entries.length === 0) {
		return `${HEADER}};\n`;
	}
	return `${HEADER}\n${entries.join(',\n')}\n};\n`;
}

/** Overwrite kln.ts with the given catalog. Development only. */
export async function writeKlnCatalog(catalog: KlnCatalog, filePath = CATALOG_PATH): Promise<void> {
	await writeFile(filePath, serializeKlnCatalog(catalog), 'utf8');
}
