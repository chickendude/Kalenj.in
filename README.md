# Kalenjin App

## Data License

The website data is licensed separately under `LICENSE-DATA.md`.

That license allows broad educational and commercial reuse, but prohibits AI-related
uses such as training, fine-tuning, benchmarking, or dataset creation for machine
learning systems.

## Developing

Start the local dev server with:

```sh
npm run dev
```

## Testing

Unit tests are part of the normal development process in this repo. When we add new logic or fix a bug, we should add or update unit tests whenever the behavior can be tested reasonably.

Available commands:

```sh
npm run test
npm run test:run
npm run test:coverage
npm run check
```

Recommended local validation for behavior changes:

```sh
npm run test:run
npm run check
```

## Building

Create a production build with:

```sh
npm run build
```

Preview the production build with `npm run preview`.
