import { Resend } from 'resend';
import { env } from '$env/dynamic/private';

const apiKey = env.RESEND_API_KEY ?? '';
const fromAddress = env.MAIL_FROM ?? 'Kalenj.in <noreply@kalenj.in>';

// Belt-and-suspenders: even if RESEND_API_KEY leaks into the test dev server,
// refuse to instantiate the real Resend client when PLAYWRIGHT_E2E=1. The
// playwright-e2e.config.ts webServer always sets this flag.
const blockedForTests = process.env.PLAYWRIGHT_E2E === '1';
const client = apiKey && !blockedForTests ? new Resend(apiKey) : null;

export type SendEmailInput = {
	to: string;
	subject: string;
	text: string;
	html?: string;
};

export async function sendEmail({ to, subject, text, html }: SendEmailInput): Promise<void> {
	if (!client) {
		// Dev fallback: no API key configured. Log the message so the link is reachable.
		console.log(
			`[email] would send to=${to} subject="${subject}"\n${text}\n`
		);
		return;
	}
	const result = await client.emails.send({
		from: fromAddress,
		to,
		subject,
		text,
		...(html ? { html } : {})
	});
	if (result.error) {
		throw new Error(`Resend error: ${result.error.message}`);
	}
}
