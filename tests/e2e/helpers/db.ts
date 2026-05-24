import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Load .env from the project root so DATABASE_URL is available when Playwright
// spawns these tests outside the SvelteKit runtime.
loadEnv();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
	throw new Error('DATABASE_URL is not set; cannot run E2E tests against a real database.');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
export const prisma = new PrismaClient({ adapter });

/**
 * Make sure no leftover row from a prior run is sitting in the way before
 * (and after) each test. We always delete by both username and email so a
 * partial earlier failure can't poison the next run.
 */
export async function purgeUser(args: { username?: string; email?: string }): Promise<void> {
	const ors = [];
	if (args.username) ors.push({ username: args.username });
	if (args.email) ors.push({ email: args.email });
	if (ors.length === 0) return;
	await prisma.user.deleteMany({ where: { OR: ors } });
}

export async function latestTokenFor(userId: string): Promise<string | null> {
	const row = await prisma.emailVerificationToken.findFirst({
		where: { userId },
		orderBy: { createdAt: 'desc' }
	});
	return row?.id ?? null;
}

export async function getUserState(username: string): Promise<{
	id: string;
	email: string | null;
	emailVerifiedAt: Date | null;
	role: string;
	tokenCount: number;
} | null> {
	const user = await prisma.user.findUnique({
		where: { username },
		include: { _count: { select: { emailVerificationTokens: true } } }
	});
	if (!user) return null;
	return {
		id: user.id,
		email: user.email,
		emailVerifiedAt: user.emailVerifiedAt,
		role: user.role,
		tokenCount: user._count.emailVerificationTokens
	};
}

/**
 * Push the user's latest token's createdAt back by `ms` milliseconds so a
 * test can step past the 60s cooldown without sleeping.
 */
export async function backdateLatestToken(userId: string, ms: number): Promise<void> {
	const latest = await prisma.emailVerificationToken.findFirst({
		where: { userId },
		orderBy: { createdAt: 'desc' }
	});
	if (!latest) return;
	await prisma.emailVerificationToken.update({
		where: { id: latest.id },
		data: { createdAt: new Date(latest.createdAt.getTime() - ms) }
	});
}
