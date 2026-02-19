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
  - relevant unit/integration tests when present
- New logic should include tests where feasible, especially for domain/application behavior.

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
