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

## Importing production data

To pull a fresh copy of the production database and uploaded media into your
local dev setup:

```sh
npm run db:import-prod
```

This SSHes into the production VPS, runs `pg_dump` there, then **drops and
recreates** your local database (named in `.env` `DATABASE_URL`) and restores
the dump — no prompt, since the local DB is a disposable mirror of production.
It also `rsync`s the production audio/image uploads down so local playback
works. Pass `--skip-media` to import only the database. Requires local
`psql`/`pg_restore`/`rsync` and SSH access to the server.

Set `PROD_SSH_TARGET` (e.g. `user@your-host`) in your gitignored `.env` — the
production host is intentionally not committed. `PROD_APP_DIR` is optional
(defaults to `/var/www/kalenjin`). See `scripts/import-prod-db.sh --help`.

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
