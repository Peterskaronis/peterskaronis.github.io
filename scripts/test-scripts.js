#!/usr/bin/env node

/**
 * Tests for the content-sync scripts.
 *
 * Usage: node scripts/test-scripts.js
 *
 * These cover the failure modes that actually bit this repo: silent no-op
 * rewrites of index.html, unescaped RSS titles landing in generated HTML, and
 * frontmatter mangled by escape-then-truncate.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const posts = require('./update-posts.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok    ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL  ${name}\n        ${err.message}`);
  }
}

function withTempIndex(body, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skaronis-test-'));
  const file = path.join(dir, 'index.html');
  fs.writeFileSync(file, body);
  try {
    return fn(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const SAMPLE_POST = {
  url: '/blog/hello-world/',
  title: 'Hello World',
  siteName: 'Substack',
  date: new Date('2026-03-15T12:00:00Z')
};

// ---------------------------------------------------------------------------
console.log('\nescapeHtml');

test('escapes the characters that break attributes and markup', () => {
  assert.strictEqual(
    posts.escapeHtml(`<img src=x onerror=alert(1)>`),
    '&lt;img src=x onerror=alert(1)&gt;'
  );
  assert.strictEqual(posts.escapeHtml('a "b" \'c\' & d'), 'a &quot;b&quot; &#39;c&#39; &amp; d');
});

test('handles null and undefined without throwing', () => {
  assert.strictEqual(posts.escapeHtml(null), '');
  assert.strictEqual(posts.escapeHtml(undefined), '');
});

// ---------------------------------------------------------------------------
console.log('\nformatMonthYear');

test('is stable regardless of the machine timezone', () => {
  // 1 March 00:30 UTC is still February in Vancouver. CI (UTC) and a local run
  // must not disagree, or they overwrite each other forever.
  const d = new Date('2026-03-01T00:30:00Z');
  assert.strictEqual(posts.formatMonthYear(d), 'March 2026');
});

// ---------------------------------------------------------------------------
console.log('\nrenderLatestPost');

test('escapes a hostile RSS title', () => {
  const html = posts.renderLatestPost({
    ...SAMPLE_POST,
    title: '</h2><script>alert(1)</script>'
  });
  assert.ok(!html.includes('<script>'), 'raw <script> leaked into the homepage');
  assert.ok(html.includes('&lt;script&gt;'), 'title was not escaped');
});

test('escapes a URL that would break out of the href attribute', () => {
  const html = posts.renderLatestPost({
    ...SAMPLE_POST,
    url: '/x" onmouseover="alert(1)'
  });
  assert.ok(!html.includes('onmouseover="alert(1)"'), 'attribute break-out was not neutralised');
  assert.ok(html.includes('&quot;'), 'url quote was not escaped');
});

test('a title containing $& is written literally', () => {
  // String.replace treats $& in the replacement as "the whole match". The old
  // code interpolated titles straight into a replacement string.
  const html = posts.renderLatestPost({ ...SAMPLE_POST, title: 'Cost $& Value $1' });
  assert.ok(html.includes('Cost $&amp; Value $1'), `got: ${html}`);
});

// ---------------------------------------------------------------------------
// Regression tests for the Devin review finding (2026-08-09): escaping alone
// does not stop a javascript: URL reaching an href.
console.log('\nsafeUrl');

test('accepts root-relative paths and https URLs', () => {
  assert.strictEqual(posts.safeUrl('/blog/x/'), '/blog/x/');
  assert.strictEqual(posts.safeUrl('https://example.com/p'), 'https://example.com/p');
});

test('rejects javascript, data and vbscript schemes', () => {
  for (const bad of [
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    '  javascript:alert(1)  ',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    'vbscript:msgbox(1)',
    'http://example.com/insecure'
  ]) {
    assert.strictEqual(posts.safeUrl(bad), null, `should have rejected: ${JSON.stringify(bad)}`);
  }
});

test('rejects protocol-relative URLs', () => {
  assert.strictEqual(posts.safeUrl('//evil.example/x'), null);
});

test('rejects empty and missing values', () => {
  assert.strictEqual(posts.safeUrl(''), null);
  assert.strictEqual(posts.safeUrl(null), null);
  assert.strictEqual(posts.safeUrl(undefined), null);
});

test('renderLatestPost refuses to emit a javascript: link', () => {
  assert.throws(
    () => posts.renderLatestPost({ ...SAMPLE_POST, url: 'javascript:alert(document.domain)' }),
    /unsupported URL scheme/i
  );
});

// ---------------------------------------------------------------------------
console.log('\nupdateIndexHTML');

const GOOD_PAGE = `<html><body>
    <div>
                ${posts.LATEST_POST_START}
                <a href="/blog/old/" class="latest-content">
                    <h2 class="latest-title">Old Title</h2>
                    <p class="latest-meta">January 2020 · <span class="latest-source">Substack</span></p>
                </a>
                ${posts.LATEST_POST_END}
    </div>
</body></html>`;

test('rewrites the block between the markers', () => {
  withTempIndex(GOOD_PAGE, (file) => {
    const out = rewriteVia(file, SAMPLE_POST);
    assert.ok(out.includes('Hello World'), 'new title missing');
    assert.ok(out.includes('/blog/hello-world/'), 'new url missing');
    assert.ok(out.includes('March 2026'), 'new date missing');
    assert.ok(!out.includes('Old Title'), 'old title still present');
    assert.ok(out.includes(posts.LATEST_POST_START), 'start marker was consumed');
    assert.ok(out.includes(posts.LATEST_POST_END), 'end marker was consumed');
  });
});

test('is idempotent', () => {
  withTempIndex(GOOD_PAGE, (file) => {
    const once = rewriteVia(file, SAMPLE_POST);
    fs.writeFileSync(file, once);
    const twice = rewriteVia(file, SAMPLE_POST);
    assert.strictEqual(once, twice, 'second run produced different output');
  });
});

test('throws loudly when the markers are missing', () => {
  withTempIndex('<html><body><p>no markers here</p></body></html>', (file) => {
    assert.throws(
      () => rewriteVia(file, SAMPLE_POST),
      /markers/i,
      'a missing marker must fail the build, not silently no-op'
    );
  });
});

test('leaves no temp file behind', () => {
  withTempIndex(GOOD_PAGE, (file) => {
    rewriteVia(file, SAMPLE_POST);
    const leftovers = fs.readdirSync(path.dirname(file)).filter(f => f.includes('.tmp-'));
    assert.deepStrictEqual(leftovers, [], `temp files left: ${leftovers}`);
  });
});

// updateIndexHTML takes the target path, so tests operate purely on a temp file
// and can never touch the real homepage.
function rewriteVia(fixtureFile, post) {
  posts.updateIndexHTML(post, fixtureFile);
  return fs.readFileSync(fixtureFile, 'utf8');
}

// ---------------------------------------------------------------------------
console.log('\ngenerateMarkdownFile frontmatter');

test('quotes a title containing double quotes', () => {
  const result = posts.generateMarkdownFile({
    title: 'She said "hello" to me',
    description: 'short',
    date: new Date('2026-01-05T00:00:00Z'),
    url: 'https://example.com/p',
    originalUrl: 'https://example.com/p',
    siteName: 'Substack',
    content: '<p>hi</p>'
  });
  const fm = result.content.split('---')[1];
  assert.ok(fm.includes('title: "She said \\"hello\\" to me"'), `got: ${fm}`);
});

test('a 200-char boundary cannot leave a dangling escape', () => {
  // Escape-then-truncate could cut between a backslash and its quote and emit
  // unparseable frontmatter. Truncate first, then quote.
  const description = 'x'.repeat(199) + '"' + 'tail';
  const result = posts.generateMarkdownFile({
    title: 'T',
    description,
    date: new Date('2026-01-05T00:00:00Z'),
    url: 'https://example.com/p',
    originalUrl: 'https://example.com/p',
    siteName: 'Substack',
    content: '<p>hi</p>'
  });
  const line = result.content.split('\n').find(l => l.startsWith('description:'));
  const value = line.slice('description: '.length);
  assert.doesNotThrow(() => JSON.parse(value), `unparseable frontmatter value: ${value}`);
});

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
