// All WOTD dates are represented as UTC midnight of a local calendar day.
// This matches Postgres's `@db.Date` round-trip (DATE columns are tz-naive,
// Prisma marshals them as 00:00:00Z) so equality checks and lookups work
// regardless of the server's local timezone.

function isUtcMidnight(d: Date): boolean {
	return (
		d.getUTCHours() === 0 &&
		d.getUTCMinutes() === 0 &&
		d.getUTCSeconds() === 0 &&
		d.getUTCMilliseconds() === 0
	);
}

export function startOfLocalDay(date: Date = new Date()): Date {
	if (isUtcMidnight(date)) return date;
	return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

export function wordOfTheDayKey(date: Date = new Date()): number {
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
