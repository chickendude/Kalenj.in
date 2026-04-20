import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import argon2 from 'argon2';

async function main() {
	const username = process.env.ADMIN_USERNAME?.trim();
	const password = process.env.ADMIN_PASSWORD;

	if (!username || !password) {
		console.error('ADMIN_USERNAME and ADMIN_PASSWORD must be set in env.');
		process.exit(1);
	}
	if (password.length < 12) {
		console.error('ADMIN_PASSWORD must be at least 12 characters.');
		process.exit(1);
	}

	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) {
		console.error('DATABASE_URL must be set.');
		process.exit(1);
	}

	const pool = new Pool({ connectionString });
	const adapter = new PrismaPg(pool);
	const prisma = new PrismaClient({ adapter });

	const passwordHash = await argon2.hash(password, {
		type: argon2.argon2id,
		memoryCost: 19456,
		timeCost: 2,
		parallelism: 1
	});

	const user = await prisma.user.upsert({
		where: { username },
		update: { passwordHash, role: 'ADMIN' },
		create: { username, passwordHash, role: 'ADMIN' }
	});

	console.log(`Admin user ready: ${user.username} (${user.id})`);
	await prisma.$disconnect();
	await pool.end();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
