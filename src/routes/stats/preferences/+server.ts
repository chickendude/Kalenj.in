import { error, json } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { requireUser } from '$lib/server/guards';
import {
	buildStatsFilterParams,
	parseStatsMetrics,
	parseStatsRange
} from '$lib/stats-preferences';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request }) => {
	const user = requireUser(locals);
	const data = await request.formData().catch(() => null);
	if (!data) throw error(400, 'Invalid form data.');

	const preference = buildStatsFilterParams(
		parseStatsRange(String(data.get('range') ?? '')),
		parseStatsMetrics(data.getAll('metrics').map(String))
	).toString();

	await prisma.user.update({
		where: { id: user.id },
		data: { statsFilterPreference: preference }
	});

	locals.user = { ...user, statsFilterPreference: preference };
	return json({ statsFilterPreference: preference });
};
