#!/usr/bin/env node
import { existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const dryRun = process.argv.includes('--dry-run');

const candidateDirs = [
  '.',
  'fmweb-ide',
  'proxy',
  'extension',
  'designer-ui',
  'runtime-next',
  'shared'
];

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

function run(cmd, args, cwd) {
  log(`$ ${cmd} ${args.join(' ')}  (cwd=${cwd})`);
  if (dryRun) return;
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function installAt(relDir) {
  const cwd = relDir === '.' ? root : join(root, relDir);
  const lockPath = join(cwd, 'package-lock.json');
  const envExample = join(cwd, '.env.example');
  const envLocal = join(cwd, '.env.local');

  log(`\n==> Installing dependencies in ${relDir}`);
  if (existsSync(lockPath)) {
    run('npm', ['ci', '--no-audit', '--no-fund'], cwd);
  } else {
    run('npm', ['install', '--no-audit', '--no-fund'], cwd);
  }

  if (existsSync(envExample) && !existsSync(envLocal)) {
    log(`--> Creating ${relDir}/.env.local from .env.example`);
    if (!dryRun) copyFileSync(envExample, envLocal);
  }
}

const targets = [];
for (const rel of candidateDirs) {
  const pkgPath = rel === '.' ? join(root, 'package.json') : join(root, rel, 'package.json');
  if (existsSync(pkgPath)) {
    if (rel === '.' || !targets.includes('.')) {
      targets.push(rel);
    }
  }
}

if (targets.length === 0) {
  log('No package.json found in root or known subprojects. Nothing to install.');
  process.exit(0);
}

for (const target of targets) {
  installAt(target);
}

log('\nSetup complete.');
