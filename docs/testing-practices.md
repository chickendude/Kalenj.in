# Testing Practices

Use this as the local checklist for browser and component tests.

## Playwright

- Test user-visible behavior first. Prefer roles, labels, visible text, and explicit accessible names over CSS selectors or implementation details.
- Keep tests isolated. Each test should mount or navigate to its own setup and avoid relying on state from another test.
- Use web-first assertions such as `await expect(locator).toBeVisible()` and `await expect(page).toHaveURL(...)`; avoid manual `isVisible()` assertions unless there is a specific reason.
- Avoid real third-party services and uncontrolled data. Mock or mount local fixtures for focused UI behavior.
- Geometry checks are allowed when the behavior itself is layout-dependent, such as verifying a tooltip stays within the viewport. Still locate the element by user-facing role first, then measure its bounding box.
- Keep traces on retry instead of always-on tracing to avoid heavy test output.
- For CI, install only the browsers the suite uses. This repo's Playwright component tests currently use Chromium projects.

## Current Commands

- Unit/server tests: `npm run test:run`
- Svelte/type checks: `npm run check`
- Playwright component tests: `npm run test:ct`

If the Playwright browser is missing locally or in CI, install Chromium with:

```sh
npx playwright install chromium
```

## Source

These practices follow the official Playwright best-practices guidance:
https://playwright.dev/docs/best-practices
