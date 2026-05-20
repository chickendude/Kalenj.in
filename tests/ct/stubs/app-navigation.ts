// Test double for SvelteKit's `$app/navigation`. SentenceTokenAnnotations only
// imports `invalidateAll`; in component tests there is no SvelteKit router, so
// it is a no-op.

export async function invalidateAll(): Promise<void> {}

export async function goto(): Promise<void> {}

export function beforeNavigate(): void {}

export function afterNavigate(): void {}
