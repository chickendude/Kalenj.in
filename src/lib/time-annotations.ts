type Meridiem = 'AM' | 'PM';

export type SentenceTimeAnnotation = {
	sourceText: string;
	westernTime: string;
	note: string;
};

export type SentenceTimePart =
	| {
			type: 'text';
			text: string;
	  }
	| {
			type: 'time';
			text: string;
			annotation: SentenceTimeAnnotation;
	  };

const TIME_PATTERN =
	/\b(1[0-2]|0?[1-9])(?:(?::([0-5]\d))|(?:\s+o['’]clock))?(?:\s*([AaPp])\.?\s*[Mm]\.?)?\b/g;
const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

function stripEdgePunctuation(value: string): string {
	return value.replace(EDGE_PUNCTUATION, '');
}

function normalizeMeridiem(value: string | undefined): Meridiem | null {
	if (!value) return null;
	return value.toUpperCase() === 'A' ? 'AM' : 'PM';
}

function formatWesternHour(hour: number): number {
	const normalized = hour % 12;
	return normalized === 0 ? 12 : normalized;
}

function formatWesternTime(hour: number, minute: string, meridiem: Meridiem | null): string {
	const hourText = formatWesternHour(hour);
	const minuteText = `:${minute}`;
	return meridiem ? `${hourText}${minuteText} ${meridiem}` : `${hourText}${minuteText}`;
}

function convertSwahiliHourToWestern(
	hour: number,
	minute: string | undefined,
	meridiem: Meridiem | null
): SentenceTimeAnnotation {
	const normalizedMinute = minute ?? '00';

	if (!meridiem) {
		const westernHour = (hour % 12) + 6;
		return {
			sourceText: `${hour}:${normalizedMinute}`,
			westernTime: formatWesternTime(westernHour, normalizedMinute, null),
			note: 'In Kenya, the clock starts at sunrise (6 AM) and goes until sunset (6 PM). To convert to our time, you add 6 hours.'
		};
	}

	const periodStart = meridiem === 'AM' ? 6 : 18;
	const western24Hour = (periodStart + (hour % 12)) % 24;
	const westernMeridiem: Meridiem = western24Hour < 12 ? 'AM' : 'PM';

	return {
		sourceText: `${hour}:${normalizedMinute} ${meridiem}`,
		westernTime: formatWesternTime(western24Hour, normalizedMinute, westernMeridiem),
		note: 'In Kenya, the clock starts at sunrise (6 AM) and goes until sunset (6 PM). To convert to our time, you add 6 hours.'
	};
}

export function getSentenceTimeAnnotation(text: string): SentenceTimeAnnotation | null {
	const cleaned = stripEdgePunctuation(text.trim());
	const match = cleaned.match(
		/^(1[0-2]|0?[1-9])(?:(?::([0-5]\d))|(?:\s+o['’]clock))?(?:\s*([AaPp])\.?\s*[Mm]\.?)?$/
	);
	if (!match || (!match[2] && !match[3] && !/o['’]clock/i.test(cleaned))) {
		return null;
	}

	const hour = Number(match[1]);
	const minute = match[2];
	const meridiem = normalizeMeridiem(match[3]);
	return convertSwahiliHourToWestern(hour, minute, meridiem);
}

export function annotateSentenceTimes(text: string): SentenceTimePart[] {
	const parts: SentenceTimePart[] = [];
	let lastIndex = 0;

	for (const match of text.matchAll(TIME_PATTERN)) {
		const fullMatch = match[0];
		const start = match.index ?? 0;
		const end = start + fullMatch.length;
		const minute = match[2];
		const meridiem = normalizeMeridiem(match[3]);

		if (!minute && !meridiem && !/o['’]clock/i.test(fullMatch)) {
			continue;
		}

		if (start > lastIndex) {
			parts.push({
				type: 'text',
				text: text.slice(lastIndex, start)
			});
		}

		parts.push({
			type: 'time',
			text: fullMatch,
			annotation: convertSwahiliHourToWestern(Number(match[1]), minute, meridiem)
		});

		lastIndex = end;
	}

	if (lastIndex < text.length) {
		parts.push({
			type: 'text',
			text: text.slice(lastIndex)
		});
	}

	return parts.length > 0 ? parts : [{ type: 'text', text }];
}
