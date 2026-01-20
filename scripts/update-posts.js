#!/usr/bin/env node

/**
 * Fetches posts from Substack RSS feeds, merges with blog posts, and updates the website.
 *
 * Usage: node scripts/update-posts.js
 *
 * This script:
 * 1. Fetches RSS feeds from blog.skaronis.com and notes.techimpossible.com
 * 2. Loads self-hosted blog posts from blog-posts.json
 * 3. Parses and combines all posts
 * 4. Updates the latest post in index.html
 * 5. Regenerates archive.html with all posts grouped by year/month
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const FEEDS = [
  {
    url: 'https://blog.skaronis.com/feed',
    source: 'Essays',
    sourceClass: 'essays',
    siteName: 'Substack',
    useForLatest: true  // Only this feed is used for the "Latest" section on homepage
  },
  {
    url: 'https://notes.techimpossible.com/feed',
    source: 'Technical',
    sourceClass: 'technical',
    siteName: 'Cybersecurity Notes',
    useForLatest: false
  }
];

const BLOG_POSTS_JSON = path.join(__dirname, '..', 'blog-posts.json');

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
      useForLatest: true  // Blog posts are eligible for the "Latest" section
    }));
  } catch (err) {
    console.error(`Error loading blog posts: ${err.message}`);
    return [];
  }
}

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

    if (titleMatch && linkMatch && pubDateMatch) {
      const title = titleMatch[1].trim();
      // Skip placeholder posts
      if (title.toLowerCase() === 'coming soon') continue;

      posts.push({
        title,
        url: linkMatch[1].trim(),
        date: new Date(pubDateMatch[1].trim()),
        source: feedConfig.source,
        sourceClass: feedConfig.sourceClass,
        siteName: feedConfig.siteName,
        useForLatest: feedConfig.useForLatest
      });
    }
  }

  return posts;
}

function formatMonth(date) {
  return date.toLocaleDateString('en-US', { month: 'long' });
}

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
            <p>All my writing from Substack, Cybersecurity Notes, and my Blog, organized by date.</p>
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

  // Update the latest post section (updated for new class names)
  const latestPostRegex = /(<section class="latest-grid">[\s\S]*?<span class="stamp">Off the Press<\/span>[\s\S]*?<a href=")[^"]+(" class="latest-content">[\s\S]*?<h2 class="latest-title">)[^<]+(<\/h2>[\s\S]*?<p class="latest-meta">)[^<]+(<span class="latest-source">)[^<]+(<\/span><\/p>)/;

  const monthYear = formatMonthYear(latestPost.date);

  html = html.replace(
    latestPostRegex,
    `$1${latestPost.url}$2${latestPost.title}$3${monthYear} · $4${latestPost.siteName}$5`
  );

  fs.writeFileSync(indexPath, html);
  console.log(`Updated index.html with latest post: "${latestPost.title}"`);
}

async function main() {
  console.log('Fetching RSS feeds...\n');

  let allPosts = [];

  for (const feed of FEEDS) {
    try {
      console.log(`Fetching ${feed.url}...`);
      const xml = await fetch(feed.url);
      const posts = parseRSS(xml, feed);
      console.log(`  Found ${posts.length} posts from ${feed.siteName}`);
      allPosts = allPosts.concat(posts);
    } catch (err) {
      console.error(`  Error fetching ${feed.url}: ${err.message}`);
    }
  }

  // Load self-hosted blog posts
  console.log('\nLoading blog posts from blog-posts.json...');
  const blogPosts = loadBlogPosts();
  console.log(`  Found ${blogPosts.length} blog post(s)`);
  allPosts = allPosts.concat(blogPosts);

  // Sort by date descending
  allPosts.sort((a, b) => b.date - a.date);

  console.log(`\nTotal posts: ${allPosts.length}`);

  if (allPosts.length === 0) {
    console.error('No posts found. Aborting.');
    process.exit(1);
  }

  // Update index.html with the latest post from personal Substack only
  const personalPosts = allPosts.filter(p => p.useForLatest);
  const latestPost = personalPosts[0];
  console.log(`\nLatest post (from personal Substack): "${latestPost.title}" (${formatMonthYear(latestPost.date)})`);
  updateIndexHTML(latestPost);

  // Generate archive.html
  const archivePath = path.join(__dirname, '..', 'archive.html');
  const archiveHTML = generateArchiveHTML(allPosts);
  fs.writeFileSync(archivePath, archiveHTML);
  console.log(`\nGenerated archive.html with ${allPosts.length} posts`);

  console.log('\nDone!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
