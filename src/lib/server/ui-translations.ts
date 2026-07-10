import { prisma } from '$lib/server/prisma';
import type { Locale } from '$lib/i18n/locale';
import { en, type MessageKey } from '$lib/i18n/messages/en';
import type { MessageOverrides } from '$lib/i18n/translate';

/**
 * Load the editable UI translation overrides for a locale as a key → value
 * map. Rows whose key no longer exists in the English catalog are skipped
 * (they can linger after a key is renamed or removed in code).
 */
export async function getUiTranslationOverrides(locale: Locale): Promise<MessageOverrides> {
	const rows = await prisma.uiTranslation.findMany({ where: { locale } });
	const overrides: MessageOverrides = {};
	for (const row of rows) {
		if (row.key in en) overrides[row.key as MessageKey] = row.value;
	}
	return overrides;
}
