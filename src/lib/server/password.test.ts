import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('hashPassword + verifyPassword', () => {
	it('produces an argon2id hash that verifies against the original plaintext', async () => {
		const hash = await hashPassword('correct horse battery staple');

		expect(hash).toMatch(/^\$argon2id\$/);
		await expect(verifyPassword(hash, 'correct horse battery staple')).resolves.toBe(true);
	});

	it('rejects a wrong password', async () => {
		const hash = await hashPassword('hunter2-real-password');

		await expect(verifyPassword(hash, 'hunter2-fake-password')).resolves.toBe(false);
	});

	it('produces different hashes for the same plaintext (salt randomness)', async () => {
		const a = await hashPassword('same-password');
		const b = await hashPassword('same-password');

		expect(a).not.toBe(b);
		await expect(verifyPassword(a, 'same-password')).resolves.toBe(true);
		await expect(verifyPassword(b, 'same-password')).resolves.toBe(true);
	});

	it('returns false (not throws) on a malformed hash', async () => {
		await expect(verifyPassword('not-an-argon2-hash', 'whatever')).resolves.toBe(false);
		await expect(verifyPassword('', 'whatever')).resolves.toBe(false);
	});
}, 30000);
