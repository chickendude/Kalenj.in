// Test double for SvelteKit's `$app/forms` `enhance`, used only by Playwright
// component tests. It implements the contract SentenceTokenAnnotations relies
// on: intercept the form submit, call the user's submit fn to get a result
// handler, perform the request, then invoke the handler with { result, update }.
//
// Wire format differs from real SvelteKit on purpose: the form fields are sent
// as JSON (so tests can read them via request.postDataJSON()) and the response
// is taken verbatim as the ActionResult. The component only depends on the
// enhance *contract*, not the transport, so this faithfully exercises the
// autosave / stale-response logic under page.route() control.

type SubmitDetail = {
	formElement: HTMLFormElement;
	formData: FormData;
	action: URL;
	controller: AbortController;
	submitter: HTMLElement | null;
	cancel: () => void;
};

type ResultHandler = (event: {
	result: unknown;
	update: (options?: { reset?: boolean; invalidateAll?: boolean }) => Promise<void>;
	formElement: HTMLFormElement;
	formData: FormData;
	action: URL;
}) => void | Promise<void>;

type SubmitFn = (detail: SubmitDetail) => ResultHandler | void;

export function enhance(form: HTMLFormElement, submit?: SubmitFn) {
	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();

		const formData = new FormData(form);
		const action = new URL(
			form.action || window.location.href,
			window.location.href
		);
		const controller = new AbortController();

		const handler = submit?.({
			formElement: form,
			formData,
			action,
			controller,
			submitter: event.submitter,
			cancel: () => controller.abort()
		});

		const payload: Record<string, string> = {};
		for (const [key, value] of formData.entries()) {
			payload[key] = typeof value === 'string' ? value : '';
		}

		let result: unknown;
		try {
			const response = await fetch(action.toString(), {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload),
				signal: controller.signal
			});
			result = await response.json();
		} catch (error) {
			result = { type: 'error', error };
		}

		if (typeof handler === 'function') {
			await handler({
				result,
				update: async () => {},
				formElement: form,
				formData,
				action
			});
		}
	}

	form.addEventListener('submit', handleSubmit);
	return {
		destroy() {
			form.removeEventListener('submit', handleSubmit);
		}
	};
}

export async function applyAction(): Promise<void> {}
