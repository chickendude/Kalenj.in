import { PrismaClient } from '@prisma/client';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const globalForPrisma = globalThis as unknown as {
	prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
	const connectionString = env.DATABASE_URL;

	if (!connectionString) {
		throw new Error('DATABASE_URL is not set.');
	}

	const pool = new Pool({ connectionString });
	const adapter = new PrismaPg(pool);

	return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (dev) {
	globalForPrisma.prisma = prisma;
}
