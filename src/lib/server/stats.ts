import { prisma } from '$lib/server/prisma';
import { METRIC_IDS, type Bucket, type MetricId, type RangeId, type SeriesPoint } from '$lib/stats';

// Re-export client-safe types and helpers so server-side callers can keep importing
// everything from one place. Pure helpers live in `$lib/stats`.
export {
	CUMULATIVE_SOURCE,
	cumulativeCellValue,
	filterEmptyBucketIndices,
	getEffectiveChangeMetrics,
	METRIC_IDS,
	RANGE_IDS,
	sourceChangeMetric
} from '$lib/stats';
export type { Bucket, MetricId, RangeId, SeriesPoint } from '$lib/stats';

type RawBucketRow = { bucket: Date; count: bigint };

export type StatsResult = {
	bucket: Bucket;
	from: Date;
	to: Date;
	bucketLabels: string[];
	series: Record<MetricId, SeriesPoint[]>;
	overview: {
		totalWords: number;
		totalSentences: number;
		wordsWithAudio: number;
		sentencesWithAudio: number;
	};
};

const DAY_MS = 24 * 60 * 60 * 1000;

function truncateUtc(date: Date, bucket: Bucket): Date {
	const d = new Date(date);
	d.setUTCHours(0, 0, 0, 0);
	if (bucket === 'day') return d;
	if (bucket === 'week') {
		// Postgres `date_trunc('week', ...)` aligns to Monday. Match that.
		const dow = d.getUTCDay(); // 0=Sun
		const offset = (dow + 6) % 7; // days since Monday
		d.setUTCDate(d.getUTCDate() - offset);
		return d;
	}
	if (bucket === 'month') {
		return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
	}
	return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
}

function addBuckets(date: Date, bucket: Bucket, n: number): Date {
	const d = new Date(date);
	if (bucket === 'year') {
		d.setUTCFullYear(d.getUTCFullYear() + n);
		return d;
	}
	if (bucket === 'month') {
		d.setUTCMonth(d.getUTCMonth() + n);
		return d;
	}
	const stepMs = bucket === 'day' ? DAY_MS : 7 * DAY_MS;
	return new Date(d.getTime() + n * stepMs);
}

// Pick the smallest bucket that keeps the chart readable for the given range.
// Roughly aim for ≤ ~30 bars; longer ranges roll up to coarser buckets.
export function pickBucketForRange(from: Date, to: Date): Bucket {
	const days = (to.getTime() - from.getTime()) / DAY_MS;
	if (days <= 35) return 'day';
	if (days <= 12 * 7) return 'week';
	if (days <= 5 * 365) return 'month';
	return 'year';
}

async function getEarliestActivityDate(): Promise<Date | null> {
	const [word, sentence] = await Promise.all([
		prisma.word.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
		prisma.exampleSentence.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } })
	]);
	const candidates = [word?.createdAt, sentence?.createdAt].filter(
		(d): d is Date => d instanceof Date
	);
	if (candidates.length === 0) return null;
	return candidates.reduce((min, d) => (d < min ? d : min));
}

export async function rangeBounds(
	range: RangeId,
	now: Date = new Date()
): Promise<{ from: Date; to: Date }> {
	const today = truncateUtc(now, 'day');
	const tomorrow = addBuckets(today, 'day', 1);
	if (range === 'past7Days') {
		return { from: addBuckets(today, 'day', -6), to: tomorrow };
	}
	if (range === 'past30Days') {
		return { from: addBuckets(today, 'day', -29), to: tomorrow };
	}
	if (range === 'pastYear') {
		return { from: addBuckets(today, 'day', -364), to: tomorrow };
	}
	if (range === 'thisWeek') {
		return { from: truncateUtc(now, 'week'), to: tomorrow };
	}
	if (range === 'thisMonth') {
		return { from: truncateUtc(now, 'month'), to: tomorrow };
	}
	if (range === 'thisYear') {
		return { from: truncateUtc(now, 'year'), to: tomorrow };
	}
	// allTime — fall back to "this month" if the DB is empty so the chart still has shape.
	const earliest = await getEarliestActivityDate();
	if (!earliest) return { from: truncateUtc(now, 'month'), to: tomorrow };
	return { from: truncateUtc(earliest, 'day'), to: tomorrow };
}

function buildBucketLabels(from: Date, to: Date, bucket: Bucket): string[] {
	const labels: string[] = [];
	let cursor = new Date(from);
	while (cursor < to) {
		labels.push(cursor.toISOString());
		cursor = addBuckets(cursor, bucket, 1);
	}
	return labels;
}

function fillSeries(rows: RawBucketRow[], labels: string[]): SeriesPoint[] {
	const map = new Map<string, number>();
	for (const row of rows) {
		map.set(row.bucket.toISOString(), Number(row.count));
	}
	return labels.map((label) => ({ bucket: label, count: map.get(label) ?? 0 }));
}

function toCumulative(per: SeriesPoint[], baseline: number): SeriesPoint[] {
	let running = baseline;
	return per.map((p) => {
		running += p.count;
		return { bucket: p.bucket, count: running };
	});
}

async function bucketCount(
	table: 'Word' | 'ExampleSentence',
	column: 'createdAt',
	bucket: Bucket,
	from: Date,
	to: Date
): Promise<RawBucketRow[]> {
	// `bucket` and `table` are constrained by the type system above, so safe to inline.
	const sql = `
		SELECT date_trunc('${bucket}', "${column}") AS bucket, COUNT(*) AS count
		FROM "${table}"
		WHERE "${column}" >= $1 AND "${column}" < $2
		GROUP BY bucket
		ORDER BY bucket
	`;
	return prisma.$queryRawUnsafe<RawBucketRow[]>(sql, from, to);
}

export async function loadStats(
	bucket: Bucket,
	rawFrom: Date,
	to: Date
): Promise<StatsResult> {
	// Align `from` to a bucket boundary so SQL `date_trunc` rows match JS-generated labels.
	// Without this, e.g. a monthly bucket starting April 5 would emit labels Apr 5, May 5,
	// while SQL groups everything in April under Apr 1 → no matches.
	const from = truncateUtc(rawFrom, bucket);
	const labels = buildBucketLabels(from, to, bucket);

	const [
		wordsCreatedRows,
		sentencesCreatedRows,
		baselineWords,
		baselineSentences,
		totalWords,
		totalSentences,
		wordsWithAudio,
		sentencesWithAudio
	] = await Promise.all([
		bucketCount('Word', 'createdAt', bucket, from, to),
		bucketCount('ExampleSentence', 'createdAt', bucket, from, to),
		prisma.word.count({ where: { createdAt: { lt: from } } }),
		prisma.exampleSentence.count({ where: { createdAt: { lt: from } } }),
		prisma.word.count(),
		prisma.exampleSentence.count(),
		prisma.word.count({ where: { audioUrl: { not: null } } }),
		prisma.exampleSentence.count({ where: { audioUrl: { not: null } } })
	]);

	const wordsCreated = fillSeries(wordsCreatedRows, labels);
	const sentencesCreated = fillSeries(sentencesCreatedRows, labels);

	return {
		bucket,
		from,
		to,
		bucketLabels: labels,
		series: {
			wordsCreated,
			sentencesCreated,
			cumulativeWords: toCumulative(wordsCreated, baselineWords),
			cumulativeSentences: toCumulative(sentencesCreated, baselineSentences)
		},
		overview: {
			totalWords,
			totalSentences,
			wordsWithAudio,
			sentencesWithAudio
		}
	};
}
