# Setup (New Machine)

## Prerequisites

- Git
- Node.js 20+ (`nvm` recommended)
- npm

## Quick Start

1. Clone the repository.
2. In the repo root, run:

```bash
./setup.sh
```

3. If this repo has a root `package.json`, common commands are:

```bash
npm run dev --if-present
npm run build --if-present
npm test --if-present
```

If this repo uses subprojects, `./setup.sh` installs each known subproject dependency set.

## Notes

- `./setup.sh` uses `npm ci` when a lockfile is present; falls back to `npm install`.
- If `.env.example` exists and `.env.local` does not, setup will create `.env.local` automatically.
