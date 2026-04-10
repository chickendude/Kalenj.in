# AGENTS.md

## Purpose
This file defines implementation and review standards for this repository.
All code changes should follow these rules unless explicitly overridden in a task.

## Architecture
- Follow clean architecture boundaries:
  - `src/lib/domain`: business entities and rules (framework-free TypeScript).
  - `src/lib/application`: use cases and orchestration logic.
  - `src/lib/infrastructure`: Prisma repositories, external service adapters, persistence.
  - `src/routes` and UI components: presentation only.
- Dependencies flow inward only:
  - presentation -> application -> domain
  - infrastructure -> application/domain contracts
- Do not import Prisma or SvelteKit runtime concerns into `domain`.

## DRY and Code Organization
- Keep logic single-sourced; avoid duplicating validation, mapping, and query logic across routes.
- Extract reusable pieces into `$lib` modules when behavior appears in more than one place.
- Keep modules focused and small; each file should have one clear responsibility.
- Prefer composition over large monolithic route handlers/components.

## TypeScript Standards
- Use strict TypeScript patterns; avoid `any` unless there is a documented justification.
- Prefer explicit types for:
  - exported functions
  - server actions/loaders
  - service interfaces and DTOs
- Validate external input at boundaries (form data, URL params, API payloads).
- Keep domain-level types separate from persistence models when they diverge.

## Svelte/SvelteKit Standards
- Keep `+page.server.ts` thin:
  - parse/validate request input
  - call application/service layer
  - return mapped output
- Keep business rules out of `.svelte` files.
- Use server actions for mutations and keep error handling consistent.
- Prefer reusable presentational components for repeated UI patterns.

## Prisma and Migrations
- Access Prisma through infrastructure/repository modules where practical.
- Every schema change must include a migration.
- Preserve existing data during migrations unless destructive behavior is explicitly approved.
- Document migration implications in PR descriptions.

## Testing and Validation
- Minimum local validation for behavior changes:
  - `npm run check`
  - `npm run test:run` when code paths covered by unit tests are affected
- Unit tests are part of the default development workflow for this repo, not an optional follow-up.
- New logic should include unit tests unless there is a clear reason it cannot be tested reasonably.
- Prefer adding or extracting pure helpers for behavior that needs coverage rather than leaving logic embedded in route files.
- When fixing a bug, add a unit test that would have caught it when feasible.

## Git Workflow
- Branch naming:
  - features: `feature/<short-name>`
  - bugfixes: `bugfix/<short-name>`
- Base branch for feature/bugfix PRs: `develop`.
- Release flow: `develop` -> `main`.
- PRs should include:
  - concise summary
  - migration notes (if schema changed)
  - validation steps run locally
