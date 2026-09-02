/**
 * Accord marketing landing — source assertions (SPEC-P0 R5/R12).
 *
 * Threat model (stated per SPEC-P0 §0): the public marketing surface is the
 * first trust signal a nonprofit CFO sees. The failure modes this guards:
 *  - implementation language leaking into buyer-facing copy (Neon, Prisma,
 *    endpoints, middleware) — erodes credibility and discloses stack detail;
 *  - overclaiming (autonomy, general availability, guaranteed compliance) —
 *    a compliance product must not misstate its own governance posture;
 *  - a "conversion" page with a fake form or dead CTA — every CTA must have
 *    a real, verified destination;
 *  - losing the classic chrome on donor-facing campaign pages when the
 *    Accord chrome ships (route-group regression);
 *  - status communicated by color alone in the product compositions.
 *
 * Ran against the pre-change tree and observed red (files absent) before the
 * implementation was written.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const APP = path.join(__dirname, '..', 'src', 'app');
const ACCORD = path.join(APP, '(marketing)', '(accord)');
const CLASSIC = path.join(APP, '(marketing)', '(classic)');

function read(...segments) {
  return fs.readFileSync(path.join(...segments), 'utf8');
}

test('accord landing page exists at the marketing root with the promise headline', () => {
  const src = read(ACCORD, 'page.tsx');
  assert.match(src, /Every restricted gift carries a promise/);
  assert.match(src, /Accord helps you prove it was kept/);
  assert.match(src, /catch exceptions early/);
});

test('primary CTA goes to /book-audit, secondary anchors the workflow, login stays quiet', () => {
  const page = read(ACCORD, 'page.tsx');
  const layout = read(ACCORD, 'layout.tsx');
  assert.match(page, /href="\/book-audit"/);
  assert.match(page, /href="\/?#how-it-works"/);
  assert.match(page, /See how Accord works/);
  assert.match(layout, /href="\/login"/);
  assert.match(layout, /href="\/book-audit"/);
});

test('human-authority trust line is present and autonomy is never claimed', () => {
  const page = read(ACCORD, 'page.tsx');
  assert.match(page, /AI prepares the work\. Your team retains authority\./);
  for (const banned of [
    /fully autonomous/i,
    /production-ready/i,
    /guaranteed compliance/i,
    /revolutioni[sz]e/i,
  ]) {
    assert.doesNotMatch(page, banned);
  }
});

test('workflow states what AI prepares and what the human approves, six times each', () => {
  const page = read(ACCORD, 'page.tsx');
  assert.equal((page.match(/ai: '/g) || []).length, 6);
  assert.equal((page.match(/human: '/g) || []).length, 6);
  assert.match(page, /AI prepares/);
  assert.match(page, /You approve/);
});

test('no implementation language on the buyer-facing accord surface', () => {
  for (const file of [
    'page.tsx',
    'layout.tsx',
    path.join('book-audit', 'page.tsx'),
    path.join('snapshot', 'page.tsx'),
  ]) {
    const src = read(ACCORD, file);
    for (const banned of [/Neon/i, /Prisma/, /endpoint/i, /middleware/i, /database model/i, /API-backed/i, /lorem/i, /TODO/]) {
      assert.doesNotMatch(src, banned, `${file} leaks implementation language: ${banned}`);
    }
  }
});

test('product mocks label status with text, never color alone', () => {
  const mocks = read(ACCORD, 'mocks.tsx');
  for (const label of ['Requires review', 'Confirmed', 'Evidence missing', 'Due soon', 'Awaiting approval']) {
    assert.match(mocks, new RegExp(label), `missing status label: ${label}`);
  }
});

test('book-audit is a real conversion step: existing contact channel, no fake form', () => {
  const src = read(ACCORD, 'book-audit', 'page.tsx');
  assert.match(src, /mailto:hello@magnusnonprofitservices\.com/);
  assert.doesNotMatch(src, /<form/i, 'no form may ship without a real submission target');
  assert.match(src, /Apply for the Design Partner Beta/);
});

test('the free funding snapshot survives the move from the old apex site', () => {
  // The previous apex one-pager's only offer. Carried over as its own page
  // with the same channel as the beta application: a pre-addressed draft to
  // the existing contact address, no form, nothing stored.
  const page = read(ACCORD, 'snapshot', 'page.tsx');
  assert.match(page, /mailto:hello@magnusnonprofitservices\.com/);
  assert.doesNotMatch(page, /<form/i, 'no form may ship without a real submission target');
  assert.match(page, /Request your free snapshot/);
  // The four deliverables the old page promised, kept intact.
  assert.match(page, /revenue mix/i);
  assert.match(page, /three-year/i);
  assert.match(page, /concentration/i);
  assert.match(page, /under pressure first/i);
  // The no-strings promise, kept intact.
  assert.match(page, /nothing is retained/i);
  // Reachable: a section on the landing, the nav, and the footer.
  assert.match(read(ACCORD, 'page.tsx'), /href="\/snapshot"/);
  assert.match(read(ACCORD, 'layout.tsx'), /href="\/snapshot"/);
  assert.match(read(ACCORD, 'components', 'MobileNav.tsx'), /'\/snapshot'/);
});

test('the landing keeps one primary call to action: the snapshot never competes with the beta', () => {
  const page = read(ACCORD, 'page.tsx');
  const primaries = page.match(/ac-btn--primary/g) || [];
  const primaryTargets = page.match(/href="\/book-audit" className="ac-btn ac-btn--primary"/g) || [];
  assert.equal(
    primaries.length,
    primaryTargets.length,
    'every primary button on the landing must go to /book-audit'
  );
  assert.doesNotMatch(
    page,
    /href="\/snapshot" className="ac-btn ac-btn--primary"/,
    'the snapshot link on the landing must not be styled as a primary button'
  );
});

test('the paid Clarity package is not advertised while its SOW is unreviewed', () => {
  // docs/releases/7430ad0.md §7: CLARITY_SOW.md claims not line-checked,
  // not to be sent to a client. It must not be sold from the marketing surface.
  for (const file of ['page.tsx', 'layout.tsx', path.join('snapshot', 'page.tsx')]) {
    assert.doesNotMatch(read(ACCORD, file), /Clarity Package/i, `${file} advertises the unreviewed package`);
  }
});

test('design system honors reduced motion and visible focus', () => {
  const css = read(ACCORD, 'accord.css');
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /--ac-emerald/);
});

test('classic chrome survives for tools and donor-facing campaign pages', () => {
  const layout = read(CLASSIC, 'layout.tsx');
  assert.match(layout, /href="\/tools"/);
  assert.match(layout, /href="\/login"/);
  assert.match(layout, /href="\/app"/);
  assert.ok(fs.existsSync(path.join(CLASSIC, 'tools', 'page.tsx')), 'tools route missing');
  assert.ok(
    fs.existsSync(path.join(CLASSIC, 'campaigns', '[slug]', 'page.tsx')),
    'campaign route missing'
  );
});
