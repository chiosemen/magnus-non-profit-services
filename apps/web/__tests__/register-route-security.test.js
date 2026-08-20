/**
 * P0 Task 5 — /api/auth/register must not exist.
 *
 * Self-serve registration was a takeover primitive (P0-7) and has no business
 * purpose under D1–D4 (operator create + activate). This test locks the absence.
 *
 * R12: verified failing while route.ts still existed (assert.equal(exists, false)
 * went red); passes after deletion.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROUTE = path.join(__dirname, '..', 'src', 'app', 'api', 'auth', 'register', 'route.ts');
const PAGE = path.join(__dirname, '..', 'src', 'app', '(auth)', 'register', 'page.tsx');

test('/api/auth/register route handler is absent', () => {
  assert.equal(fs.existsSync(ROUTE), false, 'register route.ts must be deleted');
});

test('/register page is absent', () => {
  assert.equal(fs.existsSync(PAGE), false, 'register page.tsx must be deleted');
});
