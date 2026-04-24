function splitCommaSeparatedValues(value: string | null | undefined): string[] {
	return String(value ?? '')
		.split(/[\r\n,]+/)
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
}

export function splitPluralFormVariants(value: string | null | undefined): {
	pluralForm: string;
	alternativePluralForms: string;
} {
	const forms = splitCommaSeparatedValues(value);

	return {
		pluralForm: forms[0] ?? '',
		alternativePluralForms: forms.slice(1).join(', ')
	};
}

export function combinePluralFormVariants(
	pluralForm: string | null | undefined,
	alternativePluralForms: string | null | undefined
): string {
	return [pluralForm, alternativePluralForms]
		.map((value) => String(value ?? '').trim())
		.filter((value) => value.length > 0)
		.join(', ');
}
