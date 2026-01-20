#!/usr/bin/env node

/**
 * Converts Markdown files to static HTML blog pages.
 *
 * Usage: node scripts/update-blog.js
 *
 * This script:
 * 1. Reads .md files from posts/ directory
 * 2. Parses YAML frontmatter (title, date, slug, description)
 * 3. Converts Markdown to HTML
 * 4. Generates blog/[slug]/index.html for each post
 * 5. Generates blog/index.html listing all posts
 * 6. Exports blog-posts.json for integration with update-posts.js
 */

const fs = require('fs');
const path = require('path');

const POSTS_DIR = path.join(__dirname, '..', 'posts');
const BLOG_DIR = path.join(__dirname, '..', 'blog');
const JSON_OUTPUT = path.join(__dirname, '..', 'blog-posts.json');

// ============================================================================
// YAML Frontmatter Parser
// ============================================================================

function parseFrontmatter(content) {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const frontmatterStr = match[1];
  const body = match[2];
  const frontmatter = {};

  for (const line of frontmatterStr.split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();

    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    frontmatter[key] = value;
  }

  return { frontmatter, body };
}

// ============================================================================
// Markdown to HTML Converter
// ============================================================================

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function convertMarkdownToHtml(markdown) {
  let html = markdown;

  // Normalize line endings
  html = html.replace(/\r\n/g, '\n');

  // Remove leading whitespace from each line (preserves code blocks later)
  html = html.split('\n').map(line => line.trimStart()).join('\n');

  // Code blocks (fenced with ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const escaped = escapeHtml(code.trim());
    const langClass = lang ? ` class="language-${lang}"` : '';
    return `<pre><code${langClass}>${escaped}</code></pre>`;
  });

  // Inline code (must come after code blocks)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headings
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr>');
  html = html.replace(/^\*\*\*$/gm, '<hr>');

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
  // Merge consecutive blockquotes
  html = html.replace(/<\/blockquote>\n<blockquote>/g, '\n');

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');

  // Unordered lists
  const lines = html.split('\n');
  let inList = false;
  const processedLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const listMatch = line.match(/^[-*] (.+)$/);

    if (listMatch) {
      if (!inList) {
        processedLines.push('<ul>');
        inList = true;
      }
      processedLines.push(`<li>${listMatch[1]}</li>`);
    } else {
      if (inList) {
        processedLines.push('</ul>');
        inList = false;
      }
      processedLines.push(line);
    }
  }
  if (inList) {
    processedLines.push('</ul>');
  }
  html = processedLines.join('\n');

  // Ordered lists
  const lines2 = html.split('\n');
  let inOList = false;
  const processedLines2 = [];

  for (let i = 0; i < lines2.length; i++) {
    const line = lines2[i];
    const olistMatch = line.match(/^\d+\. (.+)$/);

    if (olistMatch) {
      if (!inOList) {
        processedLines2.push('<ol>');
        inOList = true;
      }
      processedLines2.push(`<li>${olistMatch[1]}</li>`);
    } else {
      if (inOList) {
        processedLines2.push('</ol>');
        inOList = false;
      }
      processedLines2.push(line);
    }
  }
  if (inOList) {
    processedLines2.push('</ol>');
  }
  html = processedLines2.join('\n');

  // Paragraphs - wrap text blocks that aren't already wrapped
  const blocks = html.split(/\n\n+/);
  const wrappedBlocks = blocks.map(block => {
    const trimmed = block.trim();
    if (!trimmed) return '';
    // Don't wrap if already an HTML element
    if (/^<(h[1-6]|p|ul|ol|li|blockquote|pre|hr|div|img)/.test(trimmed)) {
      return trimmed;
    }
    // Don't wrap if it's a closing tag
    if (/^<\//.test(trimmed)) {
      return trimmed;
    }
    return `<p>${trimmed}</p>`;
  });

  html = wrappedBlocks.filter(b => b).join('\n\n');

  // Clean up any remaining newlines inside paragraphs
  html = html.replace(/<p>([\s\S]*?)<\/p>/g, (match, content) => {
    return `<p>${content.replace(/\n/g, ' ').trim()}</p>`;
  });

  return html;
}

// ============================================================================
// HTML Templates
// ============================================================================

// PostHog removed
const POSTHOG_SCRIPT = ``;

function generatePostHTML(post, content) {
  const formattedDate = new Date(post.date).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  const isoDate = new Date(post.date).toISOString();
  const postUrl = `https://skaronis.com/blog/${post.slug}/`;
  const description = escapeHtml(post.description || post.title);

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(post.title)} — Peter Skaronis</title>
${POSTHOG_SCRIPT}
    <meta name="description" content="${description}">
    <link rel="canonical" href="${postUrl}">

    <!-- Open Graph -->
    <meta property="og:type" content="article">
    <meta property="og:title" content="${escapeHtml(post.title)}">
    <meta property="og:description" content="${description}">
    <meta property="og:url" content="${postUrl}">
    <meta property="og:site_name" content="Peter Skaronis">
    <meta property="article:author" content="Peter Skaronis">
    <meta property="article:published_time" content="${isoDate}">

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary">
    <meta name="twitter:site" content="@peter_skaronis">
    <meta name="twitter:title" content="${escapeHtml(post.title)}">
    <meta name="twitter:description" content="${description}">

    <!-- JSON-LD Structured Data -->
    <script type="application/ld+json">
    {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": "${escapeHtml(post.title)}",
        "description": "${description}",
        "datePublished": "${isoDate}",
        "author": {
            "@type": "Person",
            "name": "Peter Skaronis",
            "url": "https://skaronis.com"
        },
        "publisher": {
            "@type": "Person",
            "name": "Peter Skaronis"
        },
        "mainEntityOfPage": {
            "@type": "WebPage",
            "@id": "${postUrl}"
        }
    }
    </script>

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        html { font-size: 18px; }

        body {
            font-family: 'Inter', -apple-system, sans-serif;
            background: #0a0a0a;
            color: #e5e5e5;
            line-height: 1.7;
            -webkit-font-smoothing: antialiased;
        }

        ::selection {
            background: #fff;
            color: #000;
        }

        a {
            color: #fff;
            text-decoration: underline;
            text-decoration-thickness: 1px;
            text-underline-offset: 3px;
        }

        a:hover {
            text-decoration-thickness: 2px;
        }

        .container {
            max-width: 700px;
            margin: 0 auto;
            padding: 0 2rem;
        }

        /* Header */
        header {
            padding: 4rem 0 3rem;
            border-bottom: 1px solid #333;
        }

        .back-link {
            font-size: 0.9rem;
            color: #666;
            margin-bottom: 2rem;
            display: inline-block;
        }

        .back-link:hover {
            color: #fff;
        }

        header h1 {
            font-family: 'Instrument Serif', Georgia, serif;
            font-size: 2.8rem;
            font-weight: 400;
            line-height: 1.15;
            letter-spacing: -0.03em;
            color: #fff;
            margin-bottom: 1rem;
        }

        .post-meta {
            font-size: 0.9rem;
            color: #666;
        }

        /* Article */
        article {
            padding: 3rem 0;
            border-bottom: 1px solid #333;
        }

        article h2 {
            font-family: 'Instrument Serif', Georgia, serif;
            font-size: 1.8rem;
            font-weight: 400;
            color: #fff;
            margin: 2.5rem 0 1rem;
            letter-spacing: -0.02em;
        }

        article h3 {
            font-family: 'Instrument Serif', Georgia, serif;
            font-size: 1.4rem;
            font-weight: 400;
            color: #fff;
            margin: 2rem 0 0.75rem;
        }

        article p {
            margin-bottom: 1.5rem;
            color: #ccc;
        }

        article ul, article ol {
            margin-bottom: 1.5rem;
            padding-left: 1.5rem;
            color: #ccc;
        }

        article li {
            margin-bottom: 0.5rem;
        }

        article blockquote {
            border-left: 3px solid #444;
            padding-left: 1.5rem;
            margin: 2rem 0;
            font-style: italic;
            color: #999;
        }

        article pre {
            background: #1a1a1a;
            padding: 1.5rem;
            border-radius: 4px;
            overflow-x: auto;
            margin: 1.5rem 0;
        }

        article code {
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 0.9rem;
        }

        article p code {
            background: #1a1a1a;
            padding: 0.2rem 0.4rem;
            border-radius: 3px;
        }

        article img {
            max-width: 100%;
            height: auto;
            border-radius: 4px;
            margin: 1.5rem 0;
        }

        article hr {
            border: none;
            border-top: 1px solid #333;
            margin: 3rem 0;
        }

        article strong {
            color: #fff;
            font-weight: 600;
        }

        /* Footer */
        footer {
            padding: 3rem 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .footer-links {
            display: flex;
            gap: 2rem;
        }

        .footer-links a {
            font-size: 0.9rem;
            color: #888;
        }

        .footer-links a:hover {
            color: #fff;
        }

        .copyright {
            font-size: 0.8rem;
            color: #444;
        }

        /* Responsive */
        @media (max-width: 768px) {
            html { font-size: 16px; }

            .container { padding: 0 1.5rem; }

            header { padding: 3rem 0 2rem; }
            header h1 { font-size: 2rem; }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <a href="/archive.html" class="back-link">&larr; Archive</a>
            <h1>${escapeHtml(post.title)}</h1>
            <p class="post-meta">${formattedDate}</p>
        </header>

        <article>
${content}
        </article>

        <footer>
            <div class="footer-links">
                <a href="/">Home</a>
                <a href="https://x.com/peter_skaronis">Twitter</a>
                <a href="https://www.linkedin.com/in/peterskaronis/">LinkedIn</a>
            </div>
            <p class="copyright">Made in Vancouver 🇨🇦</p>
        </footer>
    </div>
    <script src="/scripts/share-selection.js"></script>
</body>
</html>`;
}

function generateBlogIndexHTML(posts) {
  const grouped = {};

  for (const post of posts) {
    const date = new Date(post.date);
    const year = date.getFullYear();
    const month = date.getMonth();

    if (!grouped[year]) grouped[year] = {};
    if (!grouped[year][month]) grouped[year][month] = [];

    grouped[year][month].push(post);
  }

  const years = Object.keys(grouped).sort((a, b) => b - a);

  let sectionsHTML = '';

  for (const year of years) {
    const months = Object.keys(grouped[year]).sort((a, b) => b - a);
    let monthsHTML = '';

    for (const month of months) {
      const monthPosts = grouped[year][month];
      const monthName = new Date(year, month).toLocaleDateString('en-US', { month: 'long' });

      let postsHTML = '';
      for (const post of monthPosts) {
        postsHTML += `                    <li>
                        <a href="/blog/${post.slug}/" class="post-title">${escapeHtml(post.title)}</a>
                    </li>\n`;
      }

      monthsHTML += `            <div class="month-group">
                <p class="month-label">${monthName}</p>
                <ul class="post-list">
${postsHTML}                </ul>
            </div>\n\n`;
    }

    sectionsHTML += `        <section class="year-section">
            <h2 class="year-label">${year}</h2>

${monthsHTML}        </section>\n\n`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Blog — Peter Skaronis</title>
${POSTHOG_SCRIPT}
    <meta name="description" content="Blog posts by Peter Skaronis on cybersecurity, technology, and life.">
    <link rel="canonical" href="https://skaronis.com/blog/">

    <!-- Open Graph -->
    <meta property="og:type" content="website">
    <meta property="og:title" content="Blog — Peter Skaronis">
    <meta property="og:description" content="Blog posts by Peter Skaronis on cybersecurity, technology, and life.">
    <meta property="og:url" content="https://skaronis.com/blog/">
    <meta property="og:site_name" content="Peter Skaronis">

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary">
    <meta name="twitter:site" content="@peter_skaronis">
    <meta name="twitter:title" content="Blog — Peter Skaronis">
    <meta name="twitter:description" content="Blog posts by Peter Skaronis on cybersecurity, technology, and life.">

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        html { font-size: 18px; }

        body {
            font-family: 'Inter', -apple-system, sans-serif;
            background: #0a0a0a;
            color: #e5e5e5;
            line-height: 1.5;
            -webkit-font-smoothing: antialiased;
        }

        ::selection {
            background: #fff;
            color: #000;
        }

        a {
            color: #fff;
            text-decoration: underline;
            text-decoration-thickness: 1px;
            text-underline-offset: 3px;
        }

        a:hover {
            text-decoration-thickness: 2px;
        }

        .container {
            max-width: 900px;
            margin: 0 auto;
            padding: 0 2rem;
        }

        /* Header */
        header {
            padding: 4rem 0 3rem;
            border-bottom: 1px solid #333;
        }

        .back-link {
            font-size: 0.9rem;
            color: #666;
            margin-bottom: 2rem;
            display: inline-block;
        }

        .back-link:hover {
            color: #fff;
        }

        header h1 {
            font-family: 'Instrument Serif', Georgia, serif;
            font-size: 3.5rem;
            font-weight: 400;
            line-height: 1.1;
            letter-spacing: -0.03em;
            color: #fff;
            margin-bottom: 1rem;
        }

        header p {
            font-size: 1.1rem;
            color: #888;
            max-width: 500px;
        }

        /* Year section */
        .year-section {
            padding: 3rem 0;
            border-bottom: 1px solid #222;
        }

        .year-section:last-of-type {
            border-bottom: 1px solid #333;
        }

        .year-label {
            font-family: 'Instrument Serif', Georgia, serif;
            font-size: 2.5rem;
            font-weight: 400;
            color: #fff;
            margin-bottom: 2rem;
            letter-spacing: -0.02em;
        }

        /* Month group */
        .month-group {
            margin-bottom: 2.5rem;
        }

        .month-group:last-child {
            margin-bottom: 0;
        }

        .month-label {
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: #555;
            margin-bottom: 1rem;
        }

        /* Post list */
        .post-list {
            list-style: none;
        }

        .post-list li {
            padding: 1rem 0;
            border-bottom: 1px solid #1a1a1a;
        }

        .post-list li:first-child {
            padding-top: 0;
        }

        .post-list li:last-child {
            border-bottom: none;
            padding-bottom: 0;
        }

        .post-title {
            font-family: 'Instrument Serif', Georgia, serif;
            font-size: 1.3rem;
        }

        /* Empty state */
        .empty-state {
            padding: 4rem 0;
            text-align: center;
            color: #666;
        }

        /* Footer */
        footer {
            padding: 3rem 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .footer-links {
            display: flex;
            gap: 2rem;
        }

        .footer-links a {
            font-size: 0.9rem;
            color: #888;
        }

        .footer-links a:hover {
            color: #fff;
        }

        .copyright {
            font-size: 0.8rem;
            color: #444;
        }

        /* Responsive */
        @media (max-width: 768px) {
            html { font-size: 16px; }

            .container { padding: 0 1.5rem; }

            header { padding: 3rem 0 2rem; }
            header h1 { font-size: 2.5rem; }

            .year-label { font-size: 2rem; }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <a href="/" class="back-link">&larr; Back home</a>
            <h1>Blog</h1>
            <p>Thoughts on cybersecurity, technology, and life.</p>
        </header>

${posts.length === 0 ? '        <div class="empty-state"><p>No posts yet. Check back soon!</p></div>\n\n' : sectionsHTML}        <footer>
            <div class="footer-links">
                <a href="/">Home</a>
                <a href="https://x.com/peter_skaronis">Twitter</a>
                <a href="https://www.linkedin.com/in/peterskaronis/">LinkedIn</a>
            </div>
            <p class="copyright">Made in Vancouver 🇨🇦</p>
        </footer>
    </div>
    <script src="/scripts/share-selection.js"></script>
</body>
</html>`;
}

// ============================================================================
// Main
// ============================================================================

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function main() {
  console.log('Building blog...\n');

  // Ensure directories exist
  ensureDir(POSTS_DIR);
  ensureDir(BLOG_DIR);

  // Read all markdown files
  const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md'));
  console.log(`Found ${files.length} markdown file(s) in posts/`);

  const posts = [];

  for (const file of files) {
    const filePath = path.join(POSTS_DIR, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const { frontmatter, body } = parseFrontmatter(content);

    // Validate required fields
    if (!frontmatter.title || !frontmatter.date || !frontmatter.slug) {
      console.warn(`  Skipping ${file}: missing required frontmatter (title, date, slug)`);
      continue;
    }

    const post = {
      title: frontmatter.title,
      date: frontmatter.date,
      slug: frontmatter.slug,
      description: frontmatter.description || '',
      url: `/blog/${frontmatter.slug}/`,
      source: 'Blog',
      sourceClass: 'blog',
      siteName: 'Blog'
    };

    posts.push(post);

    // Convert markdown to HTML
    const htmlContent = convertMarkdownToHtml(body);

    // Generate post page
    const postDir = path.join(BLOG_DIR, post.slug);
    ensureDir(postDir);

    const postHTML = generatePostHTML(post, htmlContent);
    fs.writeFileSync(path.join(postDir, 'index.html'), postHTML);
    console.log(`  Generated blog/${post.slug}/index.html`);
  }

  // Sort posts by date descending
  posts.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Generate blog index
  const indexHTML = generateBlogIndexHTML(posts);
  fs.writeFileSync(path.join(BLOG_DIR, 'index.html'), indexHTML);
  console.log(`\nGenerated blog/index.html`);

  // Export posts as JSON for integration
  fs.writeFileSync(JSON_OUTPUT, JSON.stringify(posts, null, 2));
  console.log(`Exported ${posts.length} post(s) to blog-posts.json`);

  console.log('\nDone!');
}

main();
