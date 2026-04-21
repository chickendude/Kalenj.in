// All WOTD dates are represented as UTC midnight of an Eastern calendar day.
// This matches Postgres's `@db.Date` round-trip (DATE columns are tz-naive,
// Prisma marshals them as 00:00:00Z) so equality checks and lookups work
// regardless of the server's local timezone.

export const WORD_OF_THE_DAY_TIME_ZONE = 'America/New_York';

const easternDateFormatter = new Intl.DateTimeFormat('en-US', {
	timeZone: WORD_OF_THE_DAY_TIME_ZONE,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit'
});

function isUtcMidnight(d: Date): boolean {
	return (
		d.getUTCHours() === 0 &&
		d.getUTCMinutes() === 0 &&
		d.getUTCSeconds() === 0 &&
		d.getUTCMilliseconds() === 0
	);
}

function easternDateParts(date: Date): { year: number; month: number; day: number } {
	const parts = Object.fromEntries(
		easternDateFormatter.formatToParts(date).map((part) => [part.type, part.value])
	);
	return {
		year: Number(parts.year),
		month: Number(parts.month),
		day: Number(parts.day)
	};
}

export function startOfLocalDay(date?: Date): Date {
	const value = date ?? new Date();
	if (date && isUtcMidnight(value)) return value;
	const { year, month, day } = easternDateParts(value);
	return new Date(Date.UTC(year, month - 1, day));
}

export function wordOfTheDayKey(date?: Date): number {
	const d = startOfLocalDay(date);
	return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

export function pickWordOfTheDayIndex(dayKey: number, poolSize: number): number {
	if (poolSize <= 0) return 0;
	return ((dayKey % poolSize) + poolSize) % poolSize;
}

export function addDays(date: Date, days: number): Date {
	return new Date(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days)
	);
}

export function eachDay(from: Date, to: Date): Date[] {
	const start = startOfLocalDay(from);
	const end = startOfLocalDay(to);
	const out: Date[] = [];
	for (let cur = start; cur.getTime() <= end.getTime(); cur = addDays(cur, 1)) {
		out.push(cur);
	}
	return out;
}
