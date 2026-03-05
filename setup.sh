#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

echo "==> Bootstrapping: $(basename "$ROOT_DIR")"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required. Install Node.js 20+ first."
  exit 1
fi

install_npm_project() {
  local target="$1"
  echo "--> Installing dependencies in ${target}"
  if [ -f "$target/package-lock.json" ]; then
    (cd "$target" && npm ci --no-audit --no-fund) || (cd "$target" && npm install)
  else
    (cd "$target" && npm install)
  fi

  if [ -f "$target/.env.example" ] && [ ! -f "$target/.env.local" ]; then
    cp "$target/.env.example" "$target/.env.local"
    echo "    Created $target/.env.local from .env.example"
  fi
}

if [ -f "package.json" ]; then
  install_npm_project "."
else
  found=0
  for sub in fmweb-ide proxy extension designer-ui runtime-next shared; do
    if [ -f "$sub/package.json" ]; then
      found=1
      install_npm_project "$sub"
    fi
  done

  if [ "$found" -eq 0 ]; then
    echo "No Node.js package.json found at repo root or known subprojects."
    echo "Nothing to install."
  fi
fi

echo "==> Bootstrap complete"
