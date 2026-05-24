import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
	const resendSend = vi.fn();
	const resendCtor = vi.fn();
	class Resend {
		emails = { send: resendSend };
		constructor(key: string) {
			resendCtor(key);
		}
	}
	const envState: { RESEND_API_KEY?: string; MAIL_FROM?: string } = {};
	return { Resend, resendSend, resendCtor, envState };
});

const { Resend, resendSend, resendCtor, envState } = hoisted;

vi.mock('resend', () => ({ Resend }));

vi.mock('$env/dynamic/private', () => ({
	get env() {
		return envState;
	}
}));

async function importFresh() {
	vi.resetModules();
	return await import('./email');
}

beforeEach(() => {
	envState.RESEND_API_KEY = undefined;
	envState.MAIL_FROM = undefined;
	resendSend.mockReset();
	resendCtor.mockClear();
});

describe('sendEmail — no RESEND_API_KEY', () => {
	it('logs the message to the console and does not instantiate Resend', async () => {
		const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		try {
			const { sendEmail } = await importFresh();

			await sendEmail({
				to: 'recipient@example.com',
				subject: 'Hello',
				text: 'click this link: https://kalenj.in/foo'
			});

			expect(resendCtor).not.toHaveBeenCalled();
			expect(resendSend).not.toHaveBeenCalled();
			expect(logSpy).toHaveBeenCalledTimes(1);
			const logged = String(logSpy.mock.calls[0][0]);
			expect(logged).toContain('[email]');
			expect(logged).toContain('to=recipient@example.com');
			expect(logged).toContain('subject="Hello"');
			expect(logged).toContain('click this link: https://kalenj.in/foo');
		} finally {
			logSpy.mockRestore();
		}
	});
});

describe('sendEmail — with RESEND_API_KEY', () => {
	it('calls Resend.emails.send with the configured MAIL_FROM', async () => {
		envState.RESEND_API_KEY = 're_testkey';
		envState.MAIL_FROM = 'Custom <noreply@example.com>';
		resendSend.mockResolvedValue({ data: { id: 'mock-id' }, error: null });

		const { sendEmail } = await importFresh();

		await sendEmail({
			to: 'recipient@example.com',
			subject: 'Hi',
			text: 'body'
		});

		expect(resendCtor).toHaveBeenCalledWith('re_testkey');
		expect(resendSend).toHaveBeenCalledTimes(1);
		expect(resendSend.mock.calls[0][0]).toMatchObject({
			from: 'Custom <noreply@example.com>',
			to: 'recipient@example.com',
			subject: 'Hi',
			text: 'body'
		});
	});

	it('falls back to a default MAIL_FROM when env unset', async () => {
		envState.RESEND_API_KEY = 're_testkey';
		resendSend.mockResolvedValue({ data: { id: 'mock-id' }, error: null });

		const { sendEmail } = await importFresh();

		await sendEmail({ to: 'r@example.com', subject: 's', text: 't' });

		expect(resendSend.mock.calls[0][0].from).toMatch(/Kalenj\.in/);
	});

	it('throws when Resend reports an error', async () => {
		envState.RESEND_API_KEY = 're_testkey';
		resendSend.mockResolvedValue({ data: null, error: { message: 'boom' } });

		const { sendEmail } = await importFresh();

		await expect(
			sendEmail({ to: 'r@example.com', subject: 's', text: 't' })
		).rejects.toThrow(/Resend error: boom/);
	});

	it('only includes html when provided', async () => {
		envState.RESEND_API_KEY = 're_testkey';
		resendSend.mockResolvedValue({ data: { id: 'mock-id' }, error: null });

		const { sendEmail } = await importFresh();

		await sendEmail({ to: 'r@example.com', subject: 's', text: 't' });
		expect(resendSend.mock.calls[0][0]).not.toHaveProperty('html');

		await sendEmail({ to: 'r@example.com', subject: 's', text: 't', html: '<p>hi</p>' });
		expect(resendSend.mock.calls[1][0].html).toBe('<p>hi</p>');
	});
});
