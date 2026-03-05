# Setup (macOS + Windows)

## Prerequisites

- Git
- Node.js 20+
- npm

## macOS / Linux

```bash
./setup.sh
```

## Windows (PowerShell)

```powershell
.\setup.ps1
```

## Windows (Command Prompt)

```cmd
setup.cmd
```

## Optional Dry Run

```bash
node setup.mjs --dry-run
```

## After Setup

If root `package.json` exists, common commands are:

```bash
npm run dev --if-present
npm run build --if-present
npm test --if-present
```
