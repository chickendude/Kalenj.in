import { dictionaryEntryHref } from '$lib/word-url';

const LINK_REGEX =
	/\[([^\]]+)\]\(\/dictionary\/([a-z0-9][a-z0-9-]*)\)/g;

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function sanitizeLabel(label: string): string {
	return label.replace(/[\]\[;\r\n]/g, '').trim();
}

export function renderWordLinks(text: string | null | undefined): string {
	if (!text) return '';
	let result = '';
	let lastIndex = 0;
	LINK_REGEX.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = LINK_REGEX.exec(text)) !== null) {
		result += escapeHtml(text.slice(lastIndex, match.index));
		const label = escapeHtml(match[1]);
		const cuid = match[2];
		result += `<a href="/dictionary/${cuid}">${label}</a>`;
		lastIndex = match.index + match[0].length;
	}
	result += escapeHtml(text.slice(lastIndex));
	return result;
}

export function stripWordLinks(text: string | null | undefined): string {
	if (!text) return '';
	return text.replace(LINK_REGEX, (_, label) => label);
}

export function buildWordLinkInsertion(
	value: string,
	triggerStart: number,
	caretPos: number,
	pick: { id: string; kalenjin: string; href?: string }
): { nextValue: string; nextCaret: number } {
	const label = sanitizeLabel(pick.kalenjin);
	const segment = `[${label}](${pick.href ?? dictionaryEntryHref(pick)})`;
	const before = value.slice(0, triggerStart);
	const after = value.slice(caretPos);
	const nextValue = before + segment + after;
	const nextCaret = before.length + segment.length;
	return { nextValue, nextCaret };
}

export function rewriteLinkLabel(
	text: string,
	segments: string | string[],
	newLabel: string,
	newHref?: string
): string {
	const safeLabel = sanitizeLabel(newLabel);
	const escapedSegments = (Array.isArray(segments) ? segments : [segments])
		.filter(Boolean)
		.map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
	if (escapedSegments.length === 0) return text;
	const pattern = new RegExp(
		`\\[([^\\]]+)\\]\\(/dictionary/(?:${escapedSegments.join('|')})\\)`,
		'g'
	);
	return text.replace(
		pattern,
		`[${safeLabel}](${newHref ?? dictionaryEntryHref({ kalenjin: newLabel })})`
	);
}
