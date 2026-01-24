#!/usr/bin/env node

/**
 * Fetches posts from Substack RSS feeds, creates local markdown copies, and updates the website.
 *
 * Usage: node scripts/update-posts.js
 *
 * This script:
 * 1. Fetches RSS feeds from blog.skaronis.com and notes.techimpossible.com
 * 2. Extracts full content from <content:encoded>
 * 3. Converts HTML to markdown and saves to posts/ directory
 * 4. Loads all posts (imported + manually created)
 * 5. Updates the latest post in index.html
 * 6. Regenerates archive.html with all posts grouped by year/month
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const POSTS_DIR = path.join(__dirname, '..', 'posts');
const BLOG_POSTS_JSON = path.join(__dirname, '..', 'blog-posts.json');

const FEEDS = [
  {
    url: 'https://blog.skaronis.com/feed',
    source: 'Essays',
    sourceClass: 'essays',
    siteName: 'Substack',
    useForLatest: true,
    importContent: true  // Import full content to local markdown
  },
  {
    url: 'https://notes.techimpossible.com/feed',
    source: 'Technical',
    sourceClass: 'technical',
    siteName: 'Cybersecurity Notes',
    useForLatest: false,
    importContent: true  // Import full content to local markdown
  }
];

// ============================================================================
// HTTP Fetch
// ============================================================================

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ============================================================================
// HTML to Markdown Converter
// ============================================================================

function decodeHtmlEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8212;/g, '—')
    .replace(/&#8211;/g, '–')
    .replace(/&#8230;/g, '...')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
}

function htmlToMarkdown(html) {
  let md = html;

  // Decode HTML entities first
  md = md.replace(/&nbsp;/g, ' ');
  md = md.replace(/&#8213;/g, '—');
  md = md.replace(/&#8212;/g, '—');
  md = md.replace(/&#8211;/g, '–');

  // Normalize br tags
  md = md.replace(/<br\s*\/?>/gi, '<br>');

  // Remove br tags at end of paragraphs (they'll get newlines from </p>)
  md = md.replace(/<br><\/p>/g, '</p>');
  md = md.replace(/<br><\/(strong|em|b|i)><\/p>/g, '</$1></p>');

  // Remove Substack-specific wrappers and classes (but keep content)
  md = md.replace(/<div class="[^"]*">/g, '');
  md = md.replace(/<\/div>/g, '\n');
  md = md.replace(/<figure[^>]*>/g, '\n');
  md = md.replace(/<\/figure>/g, '\n');
  md = md.replace(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/g, '*$1*\n');

  // Extract img from picture elements before removing picture wrapper
  md = md.replace(/<picture[^>]*>([\s\S]*?)<\/picture>/g, (match, content) => {
    const imgMatch = content.match(/<img[^>]*>/);
    return imgMatch ? imgMatch[0] : '';
  });
  md = md.replace(/<source[^>]*>/g, '');

  // Handle images - extract the best src URL
  md = md.replace(/<img[^>]*>/g, (match) => {
    // Try to get alt text
    const altMatch = match.match(/alt="([^"]*)"/);
    const alt = altMatch ? altMatch[1] : '';

    // Try to get src - prefer the direct substack URL from data-attrs or srcset
    let src = '';

    // First try data-attrs which has the original image URL
    const dataAttrsMatch = match.match(/data-attrs="\{[^}]*&quot;src&quot;:&quot;([^&]+)&quot;/);
    if (dataAttrsMatch) {
      src = dataAttrsMatch[1];
    }

    // Fallback to regular src
    if (!src) {
      const srcMatch = match.match(/src="([^"]*)"/);
      if (srcMatch) {
        src = srcMatch[1];
        // If it's a Substack CDN URL with encoded URL, try to extract the real one
        const encodedUrl = src.match(/https%3A%2F%2Fsubstack-post-media[^"&\s]+/);
        if (encodedUrl) {
          src = decodeURIComponent(encodedUrl[0]);
        }
      }
    }

    if (src) {
      return `\n![${alt}](${src})\n`;
    }
    return '';
  });

  // Handle links around images - just keep the image, remove the link wrapper
  md = md.replace(/<a[^>]*class="[^"]*image-link[^"]*"[^>]*>([\s\S]*?)<\/a>/g, '$1');

  // Handle image links (links that only contain whitespace/newlines or just images)
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>\s*<\/a>/g, '');

  // Handle links (but skip empty ones)
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, (match, href, content) => {
    const trimmed = content.trim();
    if (!trimmed || trimmed === '\n') return '';
    // If the content is just an image, don't wrap it in a link
    if (/^!\[.*\]\(.*\)$/.test(trimmed)) return trimmed;
    return `[${trimmed}](${href})`;
  });

  // Headers
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/g, '\n# $1\n');
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/g, '\n## $1\n');
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/g, '\n### $1\n');
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/g, '\n#### $1\n');

  // Remove br tags inside inline elements before processing
  md = md.replace(/<(strong|b|em|i)[^>]*>([^<]*)<br\s*\/?>\s*<\/\1>/g, '<$1>$2</$1>');

  // Bold and italic - clean content and add spaces around
  md = md.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/g, (m, content) => {
    const clean = content.replace(/<br\s*\/?>/g, '').trim();
    return clean ? ` **${clean}** ` : '';
  });
  md = md.replace(/<b[^>]*>([\s\S]*?)<\/b>/g, (m, content) => {
    const clean = content.replace(/<br\s*\/?>/g, '').trim();
    return clean ? ` **${clean}** ` : '';
  });
  md = md.replace(/<em[^>]*>([\s\S]*?)<\/em>/g, (m, content) => {
    const clean = content.replace(/<br\s*\/?>/g, '').trim();
    return clean ? ` *${clean}* ` : '';
  });
  md = md.replace(/<i[^>]*>([\s\S]*?)<\/i>/g, (m, content) => {
    const clean = content.replace(/<br\s*\/?>/g, '').trim();
    return clean ? ` *${clean}* ` : '';
  });

  // Blockquotes - ensure proper spacing
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/g, (match, content) => {
    const cleaned = content.replace(/<[^>]+>/g, '').trim();
    const lines = cleaned.split('\n').map(line => `> ${line.trim()}`).filter(l => l !== '> ').join('\n');
    return '\n\n' + lines + '\n\n';
  });

  // Code blocks
  md = md.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/g, '\n```\n$1\n```\n');
  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/g, '`$1`');

  // Lists
  md = md.replace(/<ul[^>]*>/g, '\n');
  md = md.replace(/<\/ul>/g, '\n');
  md = md.replace(/<ol[^>]*>/g, '\n');
  md = md.replace(/<\/ol>/g, '\n');
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/g, '- $1\n');

  // Paragraphs - ensure proper spacing
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/g, '\n\n$1\n\n');

  // Horizontal rules
  md = md.replace(/<hr[^>]*>/g, '\n---\n');

  // Line breaks - convert to newlines
  md = md.replace(/<br[^>]*>/gi, '\n');

  // Remove remaining HTML tags
  md = md.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  md = decodeHtmlEntities(md);

  // Remove Substack boilerplate/CTAs
  md = md.replace(/This Substack is reader-supported\..*?(?=\n\n|$)/gs, '');
  md = md.replace(/Thanks for reading.*?(?=\n\n|$)/gs, '');
  md = md.replace(/Subscribe to.*?(?=\n\n|$)/gs, '');
  md = md.replace(/Share this post.*?(?=\n\n|$)/gs, '');
  md = md.replace(/Leave a comment.*?(?=\n\n|$)/gs, '');
  md = md.replace(/Get more from.*?(?=\n\n|$)/gs, '');
  md = md.replace(/Start writing today.*?(?=\n\n|$)/gs, '');
  md = md.replace(/Upgrade to paid.*?(?=\n\n|$)/gs, '');
  md = md.replace(/To receive new posts.*?(?=\n\n|$)/gs, '');

  // Merge adjacent/broken formatting markers
  // Fix patterns like "*text* more *text*" that should be "*text more text*"
  md = md.replace(/\*\s*\*/g, ' ');  // Adjacent italics with space
  md = md.replace(/\*\*\s*\*\*/g, ' ');  // Adjacent bold with space

  // Fix numbered list items that have broken italics
  // Pattern: "1. Who* You Are *?" → "1. Who You Are?"
  md = md.replace(/(\d+\.\s+\w+)\*\s*/g, '$1 ');  // "1. Who* " → "1. Who "
  md = md.replace(/\s*\*\s*(\?|\.|!)/g, '$1');  // " *?" → "?"
  md = md.replace(/\*(\d+\.)\s*/g, '$1 ');  // "*1. " → "1. "

  // Remove orphaned asterisks (single * not part of formatting)
  md = md.replace(/\s\*\s/g, ' ');  // " * " → " "
  md = md.replace(/\*\s+(?=[A-Z])/g, '');  // "* You" → "You"
  md = md.replace(/\s\*([A-Z])/g, ' $1');  // " *It" → " It"
  md = md.replace(/\*([A-Z][a-z]+\?)/g, '$1');  // "*As A Result?" → "As A Result?"

  // Put numbered list items on separate lines
  md = md.replace(/(\?\s*)(\d+\.)/g, '$1\n$2');  // "? 2." → "?\n2."
  md = md.replace(/(\?)(The\s)/g, '$1\n\n$2');  // "?The" → "?\n\nThe"

  // Normalize multiple spaces to single space
  md = md.replace(/  +/g, ' ');

  // Fix bold formatting: ensure no spaces inside markers
  md = md.replace(/\*\* +/g, '** ');
  md = md.replace(/ +\*\*/g, ' **');
  md = md.replace(/\*\*\s*\*\*/g, '');  // Remove empty bold
  md = md.replace(/\*\*([^*\n]+?)\*\*/g, (match, content) => {
    const trimmed = content.trim();
    return trimmed ? '**' + trimmed + '**' : '';
  });

  // Fix italic formatting
  md = md.replace(/\* +/g, '* ');
  md = md.replace(/ +\*/g, ' *');
  md = md.replace(/\*\s*\*/g, '');  // Remove empty italic (but not bold **)

  // Fix spaces around punctuation after formatting
  md = md.replace(/\*\* \./g, '**.');
  md = md.replace(/\*\* ,/g, '**,');
  md = md.replace(/\* \./g, '*.');
  md = md.replace(/\* ,/g, '*,');

  // Clean up whitespace
  md = md.replace(/\n{3,}/g, '\n\n');
  md = md.trim();

  return md;
}

// ============================================================================
// RSS Parser
// ============================================================================

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60);
}

function parseRSS(xml, feedConfig) {
  const posts = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];

    const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                       item.match(/<title>(.*?)<\/title>/);
    const linkMatch = item.match(/<link>(.*?)<\/link>/);
    const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
    const descMatch = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) ||
                      item.match(/<description>(.*?)<\/description>/);
    const contentMatch = item.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/);

    if (titleMatch && linkMatch && pubDateMatch) {
      const title = titleMatch[1].trim();
      // Skip placeholder posts
      if (title.toLowerCase() === 'coming soon') continue;

      const date = new Date(pubDateMatch[1].trim());
      const description = descMatch ? decodeHtmlEntities(descMatch[1].trim()) : '';
      const content = contentMatch ? contentMatch[1] : '';

      const slug = slugify(title);

      posts.push({
        title,
        url: feedConfig.importContent ? `/blog/${slug}/` : linkMatch[1].trim(),
        originalUrl: linkMatch[1].trim(),
        date,
        description,
        content,
        slug,
        source: feedConfig.source,
        sourceClass: feedConfig.sourceClass,
        siteName: feedConfig.siteName,
        useForLatest: feedConfig.useForLatest,
        importContent: feedConfig.importContent
      });
    }
  }

  return posts;
}

// ============================================================================
// Markdown File Generator
// ============================================================================

function generateMarkdownFile(post) {
  const dateStr = post.date.toISOString().split('T')[0];
  const slug = slugify(post.title);
  const filename = `${dateStr}-${slug}.md`;

  // Convert HTML content to markdown
  let markdown = htmlToMarkdown(post.content);

  // Add attribution footer (use originalUrl for external link)
  const attribution = `\n\n---\n\n*Originally published on [${post.siteName}](${post.originalUrl})*`;
  markdown += attribution;

  // Create frontmatter
  const frontmatter = `---
title: "${post.title.replace(/"/g, '\\"')}"
date: ${dateStr}
slug: ${slug}
description: "${post.description.replace(/"/g, '\\"').substring(0, 200)}"
original_url: ${post.url}
---

`;

  return {
    filename,
    slug,
    content: frontmatter + markdown
  };
}

function importPostToMarkdown(post) {
  const result = generateMarkdownFile(post);
  const filepath = path.join(POSTS_DIR, result.filename);

  // Check if already imported (by slug match in filename)
  const existingFiles = fs.readdirSync(POSTS_DIR);
  const alreadyExists = existingFiles.some(f => f.includes(result.slug));

  if (alreadyExists) {
    console.log(`  Skipping "${post.title}" (already imported)`);
    return null;
  }

  fs.writeFileSync(filepath, result.content);
  console.log(`  Imported "${post.title}" → posts/${result.filename}`);
  return result.filename;
}

// ============================================================================
// Load Blog Posts
// ============================================================================

function loadBlogPosts() {
  if (!fs.existsSync(BLOG_POSTS_JSON)) {
    return [];
  }

  try {
    const data = fs.readFileSync(BLOG_POSTS_JSON, 'utf8');
    const posts = JSON.parse(data);

    return posts.map(post => ({
      title: post.title,
      url: post.url,
      date: new Date(post.date),
      source: 'Blog',
      sourceClass: 'blog',
      siteName: 'Blog',
      useForLatest: true
    }));
  } catch (err) {
    console.error(`Error loading blog posts: ${err.message}`);
    return [];
  }
}

// ============================================================================
// HTML Generators
// ============================================================================

function formatMonthYear(date) {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function groupPostsByYearMonth(posts) {
  const grouped = {};

  for (const post of posts) {
    const year = post.date.getFullYear();
    const month = post.date.getMonth();

    if (!grouped[year]) grouped[year] = {};
    if (!grouped[year][month]) grouped[year][month] = [];

    grouped[year][month].push(post);
  }

  return grouped;
}

function generateArchiveHTML(posts) {
  const grouped = groupPostsByYearMonth(posts);
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
                        <a href="${post.url}" class="post-title">${post.title}</a>
                        <span class="post-source ${post.sourceClass}">${post.source}</span>
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
    <title>Archive — Peter Skaronis</title>
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
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 1rem;
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
            flex: 1;
        }

        .post-source {
            font-size: 0.75rem;
            color: #555;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            white-space: nowrap;
        }

        .post-source.essays {
            color: #7a8b6e;
        }

        .post-source.technical {
            color: #6e7a8b;
        }

        .post-source.blog {
            color: #8b6e7a;
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

            .post-list li {
                flex-direction: column;
                align-items: flex-start;
                gap: 0.25rem;
            }

            .post-source {
                margin-top: 0.25rem;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <a href="index.html" class="back-link">← Back home</a>
            <h1>Archive</h1>
            <p>All my writing, organized by date.</p>
        </header>

${sectionsHTML}        <footer>
            <div class="footer-links">
                <a href="https://x.com/peter_skaronis">Twitter</a>
                <a href="https://www.linkedin.com/in/peterskaronis/">LinkedIn</a>
            </div>
            <p class="copyright">Made in Vancouver 🇨🇦</p>
        </footer>
    </div>
</body>
</html>`;
}

function updateIndexHTML(latestPost) {
  const indexPath = path.join(__dirname, '..', 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');

  // Update the latest post section
  const latestPostRegex = /(<section class="latest-grid">[\s\S]*?<span class="stamp">Off the Press<\/span>[\s\S]*?<a href=")[^"]+(" class="latest-content">[\s\S]*?<h2 class="latest-title">)[^<]+(<\/h2>[\s\S]*?<p class="latest-meta">)[^<]+(<span class="latest-source">)[^<]+(<\/span><\/p>)/;

  const monthYear = formatMonthYear(latestPost.date);

  html = html.replace(
    latestPostRegex,
    `$1${latestPost.url}$2${latestPost.title}$3${monthYear} · $4${latestPost.siteName}$5`
  );

  fs.writeFileSync(indexPath, html);
  console.log(`Updated index.html with latest post: "${latestPost.title}"`);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('Fetching RSS feeds and importing content...\n');

  // Ensure posts directory exists
  if (!fs.existsSync(POSTS_DIR)) {
    fs.mkdirSync(POSTS_DIR, { recursive: true });
  }

  let allPosts = [];
  let importedCount = 0;

  for (const feed of FEEDS) {
    try {
      console.log(`Fetching ${feed.url}...`);
      const xml = await fetch(feed.url);
      const posts = parseRSS(xml, feed);
      console.log(`  Found ${posts.length} posts from ${feed.siteName}`);

      // Import content for feeds that have importContent: true
      if (feed.importContent) {
        console.log(`  Importing content to local markdown...`);
        for (const post of posts) {
          const imported = importPostToMarkdown(post);
          if (imported) importedCount++;
        }
      }

      allPosts = allPosts.concat(posts);
    } catch (err) {
      console.error(`  Error fetching ${feed.url}: ${err.message}`);
    }
  }

  // Load self-hosted blog posts that weren't imported from RSS
  // (to avoid duplicates - imported posts are already in allPosts from RSS)
  console.log('\nLoading manually created blog posts from blog-posts.json...');
  const blogPosts = loadBlogPosts();
  const rssSlugs = new Set(allPosts.filter(p => p.importContent).map(p => p.slug));
  const manualBlogPosts = blogPosts.filter(p => {
    const slug = p.url.replace(/^\/blog\//, '').replace(/\/$/, '');
    return !rssSlugs.has(slug);
  });
  console.log(`  Found ${manualBlogPosts.length} manually created blog post(s)`);
  allPosts = allPosts.concat(manualBlogPosts);

  // Sort by date descending
  allPosts.sort((a, b) => b.date - a.date);

  console.log(`\nTotal posts: ${allPosts.length}`);
  if (importedCount > 0) {
    console.log(`New posts imported: ${importedCount}`);
  }

  if (allPosts.length === 0) {
    console.error('No posts found. Aborting.');
    process.exit(1);
  }

  // Update index.html with the latest post that's eligible
  const eligiblePosts = allPosts.filter(p => p.useForLatest);
  const latestPost = eligiblePosts[0];
  console.log(`\nLatest post: "${latestPost.title}" (${formatMonthYear(latestPost.date)})`);
  updateIndexHTML(latestPost);

  // Generate archive.html - only show local blog posts (not external RSS)
  const localPosts = allPosts.filter(p => p.url.startsWith('/blog/'));
  const archivePath = path.join(__dirname, '..', 'archive.html');
  const archiveHTML = generateArchiveHTML(localPosts);
  fs.writeFileSync(archivePath, archiveHTML);
  console.log(`\nGenerated archive.html with ${localPosts.length} local posts`);

  console.log('\nDone!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
