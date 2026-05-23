import { describe, expect, it } from 'vitest';
import { POST } from './+server';

describe('POST /lessons/[id]/token-groups', () => {
	it('directs story token edits to the linked corpus sentence endpoint', async () => {
		let thrown: unknown;
		try {
			await POST({
				params: { id: 'lesson-1' },
				locals: {
					user: { id: 'u1', username: 'tester', displayName: null, role: 'ADMIN' },
					sessionToken: 't'
				},
				request: new Request('http://localhost/lessons/lesson-1/token-groups', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						kind: 'story',
						action: 'merge',
						sentenceId: 'story-sentence-1',
						sourceTokenId: 'token-a',
						targetTokenId: 'token-b'
					})
				})
			} as never);
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toBeTruthy();
		expect((thrown as { status: number }).status).toBe(410);
		expect((thrown as { body: { message: string } }).body.message).toBe(
			'Story sentence tokens are edited through the linked corpus sentence.'
		);
	});
});
