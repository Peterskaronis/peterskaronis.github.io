#!/usr/bin/env node

/**
 * Helpers shared by the content scripts.
 *
 * These were copy-pasted across update-posts.js, update-library.js,
 * update-blog.js, update-footer.js and update-seo.js. Four copies of escapeHtml
 * and two of fetch meant a fix landed in one script and silently missed the
 * others -- which is exactly what happened: the feed fetch was hardened in one
 * place while the Goodreads fetch kept the old unbounded version.
 *
 * Everything here is dependency-free and Node-builtin only, to keep the site
 * buildable with nothing but `node`.
 */

const https = require('https');
const fs = require('fs');

// ---------------------------------------------------------------------------
// HTML output
// ---------------------------------------------------------------------------

/** Escape text for interpolation into HTML, including double-quoted attributes. */
function escapeHtml(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escaping alone does not make a URL safe to put in href: `javascript:alert(1)`
 * contains none of the characters escapeHtml touches, so it survives intact and
 * runs on click. Allow only a site-root-relative path or an https:// URL, and
 * return null for anything else so the caller can decide how to fail.
 */
function safeUrl(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return null;

  // Root-relative ("/blog/x/"), but not protocol-relative ("//evil.example").
  if (raw.startsWith('/')) {
    return raw.startsWith('//') ? null : raw;
  }

  try {
    const parsed = new URL(raw);
    // URL() strips the tabs and newlines browsers also ignore, so
    // "java\tscript:..." still resolves to the javascript: protocol here.
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch (err) {
    return null;
  }
}

/**
 * Convert markdown links and images to HTML, safely.
 *
 * Every markdown renderer in this repo had its own copy of these two regexes,
 * each interpolating the URL straight into an attribute with `$2`. That is the
 * same class of hole safeUrl exists to close, so the renderer lives here and
 * there is exactly one implementation to get right.
 *
 * A rejected URL degrades rather than disappears: a link becomes its own text,
 * an image becomes its alt text. Losing a link beats emitting a live one.
 */
function renderMarkdownLinks(html) {
  // Images first: ![alt](url) also matches the link pattern.
  html = html.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (match, alt, url) => {
    const safe = safeUrl(url);
    if (safe === null) return escapeHtml(alt);
    return `<img src="${escapeHtml(safe)}" alt="${escapeHtml(alt)}">`;
  });

  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (match, text, url) => {
    const safe = safeUrl(url);
    if (safe === null) return escapeHtml(text);
    return `<a href="${escapeHtml(safe)}">${escapeHtml(text)}</a>`;
  });

  return html;
}

/**
 * Serialise an object for embedding in <script type="application/ld+json">.
 *
 * JSON escaping is not HTML escaping. A "</script>" inside any string closes
 * the element and everything after it parses as markup, so "<" is emitted as
 * its < escape -- still valid JSON, inert as markup. Escaping the JSON
 * with escapeHtml instead would corrupt it, which is the mistake this replaces.
 */
function jsonLdScript(value, indent = 4) {
  return JSON.stringify(value, null, indent)
    .replace(/</g, '\\u003c')
    // U+2028/U+2029 are legal in JSON but terminate a line for some parsers.
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

/**
 * Write via a temp file in the same directory, then rename. rename(2) is atomic
 * on the same filesystem, so an interrupted run cannot leave a half-written page.
 */
function writeFileAtomic(filePath, contents) {
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmpPath, contents);
  fs.renameSync(tmpPath, filePath);
}

/**
 * Replace the text between two markers, throwing if either is missing.
 *
 * Generated blocks are delimited by HTML comments rather than matched by
 * structure. A structural regex fails silently when the surrounding markup
 * changes -- String.replace simply returns the input unchanged -- so the build
 * stays green while the page quietly stops updating. A missing marker is a
 * mistake worth stopping for.
 */
function replaceBlock(html, startMarker, endMarker, body, label) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker);

  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `Could not find the ${label} markers.\n` +
      `Expected:\n  ${startMarker}\n  ...\n  ${endMarker}\n` +
      `If the page was redesigned, re-add the markers around the generated block.`
    );
  }

  return html.slice(0, start + startMarker.length) + body + html.slice(end);
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

const FETCH_IDLE_TIMEOUT_MS = 20000;
const FETCH_TOTAL_TIMEOUT_MS = 60000;
const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 15 * 1024 * 1024;

/**
 * GET a URL over HTTPS and resolve its body as a string.
 *
 * Bounded on every axis a feed can misbehave on: HTTPS only (a plaintext
 * redirect is a downgrade, not a destination), a redirect cap, a timeout, a
 * response-size ceiling, and non-2xx treated as an error -- a 404 HTML error
 * page otherwise parses as a feed with zero items and looks like success.
 */
function fetch(url, redirectsLeft = MAX_REDIRECTS) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (err) {
      return reject(new Error(`Invalid URL: ${url}`));
    }
    if (parsed.protocol !== 'https:') {
      return reject(new Error(`Refusing non-HTTPS URL: ${url}`));
    }

    const req = https.get(parsed, (res) => {
      const status = res.statusCode;

      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume(); // drain so the socket can be reused
        if (redirectsLeft <= 0) {
          return reject(new Error(`Too many redirects fetching ${url}`));
        }
        const next = new URL(res.headers.location, parsed).toString();
        return fetch(next, redirectsLeft - 1).then(resolve, reject);
      }

      if (status < 200 || status >= 300) {
        res.resume();
        return reject(new Error(`HTTP ${status} fetching ${url}`));
      }

      let data = '';
      let bytes = 0;
      res.setEncoding('utf8');
      res.on('data', chunk => {
        bytes += Buffer.byteLength(chunk, 'utf8');
        if (bytes > MAX_RESPONSE_BYTES) {
          req.destroy(new Error(`Response too large fetching ${url}`));
          return;
        }
        data += chunk;
      });
      res.on('end', () => resolve(data));
      res.on('error', reject);
    });

    // Two clocks. setTimeout is an INACTIVITY timer: a server dribbling one
    // byte every 19s would hold the job open indefinitely under it alone.
    req.setTimeout(FETCH_IDLE_TIMEOUT_MS, () => {
      req.destroy(new Error(`Idle for ${FETCH_IDLE_TIMEOUT_MS}ms fetching ${url}`));
    });
    const deadline = setTimeout(() => {
      req.destroy(new Error(`Exceeded ${FETCH_TOTAL_TIMEOUT_MS}ms total fetching ${url}`));
    }, FETCH_TOTAL_TIMEOUT_MS);
    deadline.unref();
    const clearDeadline = () => clearTimeout(deadline);
    req.on('close', clearDeadline);
    req.on('error', (err) => { clearDeadline(); reject(err); });
  });
}

module.exports = {
  escapeHtml,
  safeUrl,
  renderMarkdownLinks,
  jsonLdScript,
  writeFileAtomic,
  replaceBlock,
  fetch
};
