/**
 * Cursor merge-authority check (P0-5).
 *
 * Merge is allowed only when ALL of these hold:
 *   1. CI is green
 *   2. base branch is main
 *   3. every changed path matches docs/**
 *
 * A boolean `merge_authority: false` (or true) is not a check — it is a sentence.
 * This module refuses that shape and requires the structured `when_all` block
 * in accord-security-policy.yaml.
 *
 * Usage:
 *   node scripts/merge-authority.js --base main --ci green --files docs/a.md docs/b.md
 * Exit 0 = MERGE_ALLOWED. Exit 1 = denied (reasons on stderr).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const POLICY_PATH = path.join(__dirname, '..', 'accord-security-policy.yaml');

/**
 * @param {string} file
 * @param {string} pattern  only `literal` or `prefix/**` are supported
 */
function pathMatches(file, pattern) {
  const norm = String(file).replace(/\\/g, '/').replace(/^\.\//, '');
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -2); // 'docs/'
    return norm.startsWith(prefix);
  }
  if (pattern.includes('*')) {
    const err = new Error(`UNSUPPORTED_GLOB:${pattern}`);
    err.code = 'UNSUPPORTED_GLOB';
    throw err;
  }
  return norm === pattern;
}

function extractIndentedBlock(yamlText, headerRe) {
  const lines = yamlText.split('\n');
  const start = lines.findIndex((l) => headerRe.test(l));
  if (start === -1) return null;
  const indent = (lines[start].match(/^[ \t]*/) || [''])[0].length;
  const body = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '' || lines[i].trimStart().startsWith('#')) continue;
    const n = (lines[i].match(/^[ \t]*/) || [''])[0].length;
    if (n <= indent) break;
    body.push(lines[i]);
  }
  return body.join('\n');
}

/**
 * @param {string} yamlText
 * @returns {{ ci: string, base: string, pathsOnly: string[] }}
 */
function loadRuleFromPolicy(yamlText) {
  const cursorBlock = extractIndentedBlock(yamlText, /^cursor:\s*$/);
  if (!cursorBlock) {
    const err = new Error('CURSOR_POLICY_BLOCK_MISSING');
    err.code = 'CURSOR_POLICY_BLOCK_MISSING';
    throw err;
  }
  if (/^\s*merge_authority:\s*(true|false)\s*$/m.test(cursorBlock)) {
    const err = new Error('MERGE_AUTHORITY_MUST_BE_A_CHECK_NOT_A_BOOLEAN');
    err.code = 'MERGE_AUTHORITY_MUST_BE_A_CHECK_NOT_A_BOOLEAN';
    throw err;
  }

  const block = extractIndentedBlock(yamlText, /^\s+when_all:\s*$/);
  if (!block) {
    const err = new Error('MERGE_AUTHORITY_WHEN_ALL_MISSING');
    err.code = 'MERGE_AUTHORITY_WHEN_ALL_MISSING';
    throw err;
  }

  const ci = block.match(/^\s+ci:\s*(\S+)/m);
  const base = block.match(/^\s+base:\s*(\S+)/m);
  if (!ci || ci[1] !== 'green') {
    const err = new Error('MERGE_AUTHORITY_CI_MUST_BE_GREEN');
    err.code = 'MERGE_AUTHORITY_CI_MUST_BE_GREEN';
    throw err;
  }
  if (!base || base[1] !== 'main') {
    const err = new Error('MERGE_AUTHORITY_BASE_MUST_BE_MAIN');
    err.code = 'MERGE_AUTHORITY_BASE_MUST_BE_MAIN';
    throw err;
  }

  const paths = [];
  const pathLine = /^\s+-\s+"?([^"\n]+)"?\s*$/gm;
  if (!/paths_only:/.test(block)) {
    const err = new Error('MERGE_AUTHORITY_PATHS_ONLY_MISSING');
    err.code = 'MERGE_AUTHORITY_PATHS_ONLY_MISSING';
    throw err;
  }
  let m;
  while ((m = pathLine.exec(block)) !== null) {
    paths.push(m[1].trim());
  }
  if (!paths.includes('docs/**')) {
    const err = new Error('MERGE_AUTHORITY_PATHS_ONLY_MUST_INCLUDE_DOCS');
    err.code = 'MERGE_AUTHORITY_PATHS_ONLY_MUST_INCLUDE_DOCS';
    throw err;
  }

  return { ci: 'green', base: 'main', pathsOnly: paths };
}

/**
 * @param {{ base: string, ci: string, files: string[], rule: { ci: string, base: string, pathsOnly: string[] } }} input
 * @returns {{ allowed: boolean, reasons: string[] }}
 */
function evaluate(input) {
  const reasons = [];
  const files = Array.isArray(input.files) ? input.files : [];
  const rule = input.rule;

  if (input.ci !== rule.ci) reasons.push(`CI_NOT_GREEN:${input.ci}`);
  if (input.base !== rule.base) reasons.push(`BASE_NOT_MAIN:${input.base}`);
  if (files.length === 0) reasons.push('NO_FILES');

  const disallowed = files.filter(
    (f) => !rule.pathsOnly.some((p) => pathMatches(f, p))
  );
  if (disallowed.length > 0) {
    reasons.push(`PATHS_OUTSIDE_ALLOWLIST:${disallowed.join(',')}`);
  }

  return { allowed: reasons.length === 0, reasons };
}

function parseArgs(argv) {
  /** @type {{ base?: string, ci?: string, files: string[] }} */
  const out = { files: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--base') {
      out.base = argv[i + 1];
      i += 1;
    } else if (a === '--ci') {
      out.ci = argv[i + 1];
      i += 1;
    } else if (a === '--files') {
      out.files = argv.slice(i + 1);
      break;
    } else if (a === '--help' || a === '-h') {
      out.help = true;
    }
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      'Usage: node scripts/merge-authority.js --base main --ci green --files <path>...'
    );
    process.exit(0);
  }
  const yamlText = fs.readFileSync(POLICY_PATH, 'utf8');
  let rule;
  try {
    rule = loadRuleFromPolicy(yamlText);
  } catch (e) {
    console.error(e.code || e.message);
    process.exit(1);
  }
  const result = evaluate({
    base: String(args.base || ''),
    ci: String(args.ci || ''),
    files: args.files,
    rule,
  });
  if (!result.allowed) {
    console.error(result.reasons.join('\n'));
    process.exit(1);
  }
  console.log('MERGE_ALLOWED');
  process.exit(0);
}

module.exports = {
  POLICY_PATH,
  evaluate,
  loadRuleFromPolicy,
  pathMatches,
};

if (require.main === module) {
  main();
}
