export type ToastVariant = 'default' | 'success';

let message = $state<string | null>(null);
let variant = $state<ToastVariant>('default');
let timer: ReturnType<typeof setTimeout> | null = null;

function clearTimer() {
	if (timer) {
		clearTimeout(timer);
		timer = null;
	}
}

export const toast = {
	get message() {
		return message;
	},
	get variant() {
		return variant;
	},
	show(msg: string, opts: { ms?: number; variant?: ToastVariant } = {}) {
		clearTimer();
		message = msg;
		variant = opts.variant ?? 'default';
		const ms = opts.ms ?? 1800;
		timer = setTimeout(() => {
			message = null;
			variant = 'default';
			timer = null;
		}, ms);
	},
	success(msg: string, ms = 1800) {
		this.show(msg, { ms, variant: 'success' });
	},
	dismiss() {
		clearTimer();
		message = null;
		variant = 'default';
	}
};
