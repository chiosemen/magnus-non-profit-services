#!/usr/bin/env node
/**
 * assert-test-count.js — deterministic node:test runner with a discovery floor.
 *
 * P0-1 (SPEC-P0 R2): `node --test dist/tests` is defective in two ways.
 * On Node >= 21 a bare directory argument is require()d as a module and the
 * run fails without executing any test inside it. On Node 20 (CI) the
 * directory is scanned, but a scan that matches ZERO files exits 0 — a
 * vacuous green. Shell-expanded globs are no better: `sh` has no globstar,
 * so `dist/tests/**\/*.test.js` silently narrows to one directory level.
 *
 * This wrapper removes every silent path:
 *   1. expands the explicit glob itself (portable, no shell involved),
 *   2. HARD-FAILS when the glob matches zero files,
 *   3. passes the concrete file list to `node --test`,
 *   4. parses the TAP summary and HARD-FAILS unless
 *      pass >= --min, fail == 0, cancelled == 0 (skipped tests do NOT
 *      count toward the minimum).
 *
 * Usage (from a package directory):
 *   node ../../scripts/assert-test-count.js --min 8 --glob "dist/tests/**\/*.test.js"
 *
 * --min is the package's committed test-count floor. Lowering it requires a
 * reviewed diff of the calling package.json — that is intentional.
 */
'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function fail(message) {
  console.error(`\n[assert-test-count] FAIL: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { min: null, globs: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--min') {
      args.min = Number(argv[i + 1]);
      i += 1;
    } else if (a === '--glob') {
      args.globs.push(argv[i + 1]);
      i += 1;
    } else {
      // Tolerate pass-through extras like `pnpm test -- --coverage` instead of
      // treating them as test paths (the pre-fix scripts crashed on `--`).
      console.warn(`[assert-test-count] WARN: ignoring unknown argument ${JSON.stringify(a)}`);
    }
  }
  if (!Number.isInteger(args.min) || args.min < 1) {
    fail('--min <positive integer> is required');
  }
  if (args.globs.length === 0) {
    fail('at least one --glob "<pattern>" is required');
  }
  return args;
}

function globToRegExp(pattern) {
  // Supports the subset used by this repo: '**' (recursive), '*' (one segment).
  let out = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/') {
          out += '(?:.*/)?';
          i += 2;
        } else {
          out += '.*';
          i += 1;
        }
      } else {
        out += '[^/]*';
      }
    } else if ('\\^$.|?+()[]{}'.includes(c)) {
      out += `\\${c}`;
    } else {
      out += c;
    }
  }
  return new RegExp(`^${out}$`);
}

function walk(dir, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, acc);
    else if (entry.isFile()) acc.push(p);
  }
  return acc;
}

function expandGlob(pattern) {
  const segments = pattern.split('/');
  const firstWild = segments.findIndex((s) => s.includes('*'));
  const baseDir = firstWild <= 0 ? '.' : segments.slice(0, firstWild).join('/');
  if (!fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory()) {
    fail(
      `base directory ${JSON.stringify(baseDir)} for glob ${JSON.stringify(pattern)} does not exist. ` +
        'Build output is missing — run the package build first.'
    );
  }
  const re = globToRegExp(pattern);
  return walk(baseDir, [])
    .map((p) => p.split(path.sep).join('/'))
    .filter((p) => re.test(p))
    .sort();
}

function main() {
  const { min, globs } = parseArgs(process.argv.slice(2));
  const files = [...new Set(globs.flatMap(expandGlob))];

  if (files.length === 0) {
    fail(
      `0 test files matched ${JSON.stringify(globs)}. A run with no discovered ` +
        'tests must never pass (SPEC-P0 R2).'
    );
  }
  console.log(`[assert-test-count] discovered ${files.length} test file(s):`);
  for (const f of files) console.log(`  - ${f}`);

  // Strip NODE_TEST_CONTEXT so the child runs its files even when this guard
  // is itself invoked from inside a node:test process (it would otherwise
  // print "run() is being called recursively" and execute nothing).
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;

  const res = spawnSync(process.execPath, ['--test', ...files], {
    stdio: ['inherit', 'pipe', 'inherit'],
    encoding: 'utf8',
    env,
    maxBuffer: 64 * 1024 * 1024,
  });
  process.stdout.write(res.stdout ?? '');
  if (res.error) fail(`failed to spawn node --test: ${res.error.message}`);

  const summary = {};
  for (const key of ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
    const m = (res.stdout ?? '').match(new RegExp(`^# ${key} (\\d+)$`, 'm'));
    summary[key] = m ? Number(m[1]) : null;
  }
  if (summary.tests === null || summary.pass === null || summary.fail === null) {
    fail('could not parse the TAP summary from node --test output');
  }

  if (res.status !== 0) fail(`node --test exited with status ${res.status}`);
  if (summary.fail > 0) fail(`${summary.fail} test(s) failed`);
  if ((summary.cancelled ?? 0) > 0) fail(`${summary.cancelled} test(s) cancelled`);
  if (summary.pass < min) {
    fail(
      `only ${summary.pass} passing test(s), but this package requires at least ${min}. ` +
        'Skipped tests do not count. If tests were intentionally removed, lower ' +
        '--min in this package\'s test script in a reviewed diff.'
    );
  }

  console.log(
    `[assert-test-count] OK: ${summary.pass} passing test(s) >= required minimum ${min} ` +
      `(fail=${summary.fail}, skipped=${summary.skipped ?? 0})`
  );
}

main();
