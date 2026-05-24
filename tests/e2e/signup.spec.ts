import { expect, test, type Page } from '@playwright/test';
import {
	backdateLatestToken,
	getUserState,
	latestTokenFor,
	prisma,
	purgeUser
} from './helpers/db';

const PASSWORD = 'temporaryPassword!1';

function uniqueName(prefix: string): { username: string; email: string } {
	const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
	return {
		username: `${prefix}_${tag}`.slice(0, 40),
		email: `${prefix}_${tag}@e2e.example.com`
	};
}

/**
 * use:enhance forms don't navigate on fail, so waitForURL won't fire. Wrap the
 * click in waitForResponse so the assertion runs after the action returns.
 */
async function submitAndWaitForAction(
	page: Page,
	action: () => Promise<void>,
	pathContains: string
): Promise<void> {
	const respPromise = page.waitForResponse(
		(r) => r.url().includes(pathContains) && r.request().method() === 'POST',
		{ timeout: 15_000 }
	);
	await action();
	await respPromise;
}

// Warm up SvelteKit's dev compile for the routes we hit, so the first real test
// doesn't pay a 30s+ cold-compile penalty.
test.beforeAll(async ({ browser }) => {
	const ctx = await browser.newContext();
	const p = await ctx.newPage();
	for (const path of ['/signup', '/verify-email/sent', '/verify-email?token=warmup', '/login']) {
		await p.goto(path, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
	}
	await ctx.close();
});

test.afterAll(async () => {
	await prisma.$disconnect();
});

test.describe('signup → verify → login', () => {
	test('happy path: signup, click verify link, signed in and redirected to /', async ({
		page,
		baseURL
	}) => {
		const { username, email } = uniqueName('e2e_happy');
		await purgeUser({ username, email });

		await page.goto('/signup');
		await page.locator('#username').fill(username);
		await page.locator('#email').fill(email);
		await page.locator('#displayName').fill('E2E Happy');
		await page.locator('#password').fill(PASSWORD);
		await page.locator('#confirmPassword').fill(PASSWORD);

		await Promise.all([
			page.waitForURL(/\/verify-email\/sent/, { timeout: 60_000 }),
			page.getByRole('button', { name: 'Create account' }).click()
		]);

		await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
		await expect(page.getByText(email)).toBeVisible();

		// Server hasn't created a session yet.
		const cookiesBefore = await page.context().cookies();
		expect(cookiesBefore.find((c) => c.name === 'session')).toBeUndefined();

		const beforeVerify = await getUserState(username);
		expect(beforeVerify).not.toBeNull();
		expect(beforeVerify!.role).toBe('USER');
		expect(beforeVerify!.email).toBe(email);
		expect(beforeVerify!.emailVerifiedAt).toBeNull();
		expect(beforeVerify!.tokenCount).toBe(1);

		const token = await latestTokenFor(beforeVerify!.id);
		expect(token).not.toBeNull();

		await page.goto(`/verify-email?token=${token}`);
		await page.waitForURL(`${baseURL}/`);
		await expect(page.locator('.who')).toHaveText(username);

		const afterVerify = await getUserState(username);
		expect(afterVerify!.emailVerifiedAt).not.toBeNull();
		expect(afterVerify!.tokenCount).toBe(0); // consumed
		const cookiesAfter = await page.context().cookies();
		expect(cookiesAfter.find((c) => c.name === 'session')).toBeDefined();

		await purgeUser({ username });
	});

	// Note: the "login refuses unverified user" and "signup duplicate username"
	// flows are exercised by integration probes against the action endpoint:
	test('login action returns 403 + needsVerification for an unverified user', async ({
		page,
		request
	}) => {
		const { username, email } = uniqueName('e2e_gate');
		await purgeUser({ username, email });

		// Create an unverified user via the signup form.
		await page.goto('/signup');
		await page.locator('#username').fill(username);
		await page.locator('#email').fill(email);
		await page.locator('#password').fill(PASSWORD);
		await page.locator('#confirmPassword').fill(PASSWORD);
		await Promise.all([
			page.waitForURL(/\/verify-email\/sent/),
			page.getByRole('button', { name: 'Create account' }).click()
		]);

		// Hit the login action directly (use:enhance form on the page is JSON-RPC
		// shaped under the hood; this is the same wire format and avoids the brittle
		// "click and wait for re-render" dance).
		const params = new URLSearchParams({
			username,
			password: PASSWORD,
			redirectTo: ''
		});
		const res = await request.post('/login', {
			data: params.toString(),
			headers: {
				'x-sveltekit-action': 'true',
				accept: 'application/json',
				'content-type': 'application/x-www-form-urlencoded'
			},
			maxRedirects: 0
		});
		expect(res.status()).toBe(200);
		const body = (await res.body()).toString('utf8');
		// The action JSON encodes failure as `{"type":"failure","status":403,"data":"..."}`
		// where data is a SvelteKit devalue-encoded array. We check for the substrings
		// we care about rather than the full devalue shape (which depends on key order).
		expect(body).toContain('"type":"failure"');
		expect(body).toContain('"status":403');
		expect(body).toContain('needsVerification');
		expect(body).toContain('Verify your email before signing in.');
		expect(body).toContain(email);
		// Also: no session cookie was set.
		const setCookie = res.headers()['set-cookie'] ?? '';
		expect(setCookie).not.toContain('session=');

		await purgeUser({ username });
	});

	test('resend respects the 60s cooldown and the 5/day cap', async ({ page }) => {
		const { username, email } = uniqueName('e2e_throttle');
		await purgeUser({ username, email });

		// Initial signup creates token #1.
		await page.goto('/signup');
		await page.locator('#username').fill(username);
		await page.locator('#email').fill(email);
		await page.locator('#password').fill(PASSWORD);
		await page.locator('#confirmPassword').fill(PASSWORD);
		await Promise.all([
			page.waitForURL(/\/verify-email\/sent/),
			page.getByRole('button', { name: 'Create account' }).click()
		]);

		const initial = await getUserState(username);
		expect(initial!.tokenCount).toBe(1);

		// Hammer resend three times in quick succession — cooldown should block all.
		for (let i = 0; i < 3; i++) {
			await submitAndWaitForAction(
				page,
				() => page.getByRole('button', { name: 'Resend verification email' }).click(),
				"/verify-email/sent"
			);
		}
		const afterCooldownSpam = await getUserState(username);
		expect(afterCooldownSpam!.tokenCount).toBe(1);

		// Step past the cooldown four more times, expecting tokens to rise to 5.
		for (let i = 0; i < 4; i++) {
			await backdateLatestToken(initial!.id, 2 * 60 * 1000);
			await submitAndWaitForAction(
				page,
				() => page.getByRole('button', { name: 'Resend verification email' }).click(),
				"/verify-email/sent"
			);
		}
		const atCap = await getUserState(username);
		expect(atCap!.tokenCount).toBe(5);

		// One more attempt should be silently dropped by the daily cap.
		await backdateLatestToken(initial!.id, 2 * 60 * 1000);
		await submitAndWaitForAction(
			page,
			() => page.getByRole('button', { name: 'Resend verification email' }).click(),
			"/verify-email/sent"
		);
		const overCap = await getUserState(username);
		expect(overCap!.tokenCount).toBe(5);

		await purgeUser({ username });
	});

	test('signup action rejects a duplicate username', async ({ page, request }) => {
		const { username, email } = uniqueName('e2e_dup');
		await purgeUser({ username, email });

		// Seed the username via the form.
		await page.goto('/signup');
		await page.locator('#username').fill(username);
		await page.locator('#email').fill(email);
		await page.locator('#password').fill(PASSWORD);
		await page.locator('#confirmPassword').fill(PASSWORD);
		await Promise.all([
			page.waitForURL(/\/verify-email\/sent/),
			page.getByRole('button', { name: 'Create account' }).click()
		]);

		// Hit /signup again with the same username via the action endpoint.
		const otherEmail = email.replace('@', '+second@');
		const params = new URLSearchParams({
			username,
			email: otherEmail,
			displayName: '',
			password: PASSWORD,
			confirmPassword: PASSWORD,
			redirectTo: ''
		});
		const res = await request.post('/signup', {
			data: params.toString(),
			headers: {
				'x-sveltekit-action': 'true',
				accept: 'application/json',
				'content-type': 'application/x-www-form-urlencoded'
			},
			maxRedirects: 0
		});
		expect(res.status()).toBe(200);
		const body = (await res.body()).toString('utf8');
		expect(body).toContain('Username already taken.');
		// The duplicate attempt must NOT create a second user row.
		const dupState = await prisma.user.findUnique({ where: { email: otherEmail } });
		expect(dupState).toBeNull();

		await purgeUser({ username, email: otherEmail });
	});

	test('signup rejects an invalid email format', async ({ page }) => {
		await page.goto('/signup');
		await page.locator('#username').fill('e2e_badmail');
		// Bypass the browser's built-in <input type="email"> guard via DOM eval.
		await page.evaluate(() => {
			const el = document.getElementById('email') as HTMLInputElement;
			el.type = 'text';
			el.value = 'not-an-email';
		});
		await page.locator('#password').fill(PASSWORD);
		await page.locator('#confirmPassword').fill(PASSWORD);
		await submitAndWaitForAction(
			page,
			() => page.getByRole('button', { name: 'Create account' }).click(),
			"/signup"
		);

		await expect(page.locator('.form-feedback.error')).toHaveText(
			'Enter a valid email address.'
		);
	});
});
