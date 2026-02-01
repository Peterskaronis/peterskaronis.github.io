#!/usr/bin/env node

/**
 * Fetches books from Goodreads RSS feed and generates a library page.
 *
 * Usage: node scripts/update-library.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const GOODREADS_USER_ID = '20462898';
const GOODREADS_RSS = `https://www.goodreads.com/review/list_rss/${GOODREADS_USER_ID}?shelf=read`;
const OUTPUT_PATH = path.join(__dirname, '..', 'library.html');
const NOTES_DIR = path.join(__dirname, '..', 'book-notes');
const LIBRARY_DIR = path.join(__dirname, '..', 'library');

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

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function loadBookNote(slug) {
  const notePath = path.join(NOTES_DIR, `${slug}.md`);
  if (fs.existsSync(notePath)) {
    return fs.readFileSync(notePath, 'utf8').trim();
  }
  return null;
}

function convertMarkdownToHtml(markdown) {
  let html = markdown;
  html = html.replace(/\r\n/g, '\n');
  html = html.split('\n').map(line => line.trimStart()).join('\n');

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const escaped = escapeHtml(code.trim());
    return `<pre><code>${escaped}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

  // Unordered lists
  const lines = html.split('\n');
  let inList = false;
  const processed = [];
  for (const line of lines) {
    const listMatch = line.match(/^[-*] (.+)$/);
    if (listMatch) {
      if (!inList) { processed.push('<ul>'); inList = true; }
      processed.push(`<li>${listMatch[1]}</li>`);
    } else {
      if (inList) { processed.push('</ul>'); inList = false; }
      processed.push(line);
    }
  }
  if (inList) processed.push('</ul>');
  html = processed.join('\n');

  // Paragraphs
  const blocks = html.split(/\n\n+/);
  const wrapped = blocks.map(block => {
    const trimmed = block.trim();
    if (!trimmed) return '';
    if (/^<(h[1-6]|p|ul|ol|li|blockquote|pre)/.test(trimmed)) return trimmed;
    if (/^<\//.test(trimmed)) return trimmed;
    return `<p>${trimmed.replace(/\n/g, ' ')}</p>`;
  });

  return wrapped.filter(b => b).join('\n\n');
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function stripCDATA(str) {
  if (!str) return str;
  return str.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
}

function parseGoodreadsRSS(xml) {
  const books = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];

    const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                   item.match(/<title>(.*?)<\/title>/) || [])[1];
    const author = (item.match(/<author_name>(.*?)<\/author_name>/) || [])[1];
    const rating = (item.match(/<user_rating>(\d+)<\/user_rating>/) || [])[1];
    const cover = stripCDATA((item.match(/<book_large_image_url>(.*?)<\/book_large_image_url>/) ||
                   item.match(/<book_medium_image_url>(.*?)<\/book_medium_image_url>/) ||
                   item.match(/<book_image_url>(.*?)<\/book_image_url>/) || [])[1]);
    const link = stripCDATA((item.match(/<link>(.*?)<\/link>/) || [])[1]);
    const dateRead = (item.match(/<user_read_at>(.*?)<\/user_read_at>/) || [])[1];
    const dateAdded = (item.match(/<user_date_added>(.*?)<\/user_date_added>/) || [])[1];

    if (title && author) {
      const slug = generateSlug(title.trim());
      const note = loadBookNote(slug);
      books.push({
        title: title.trim(),
        author: author.trim(),
        rating: parseInt(rating) || 0,
        cover: cover || '',
        link: link || '',
        dateRead: dateRead ? new Date(dateRead) : null,
        dateAdded: dateAdded ? new Date(dateAdded) : null,
        slug,
        note
      });
    }
  }

  return books;
}

function generateStars(rating) {
  if (!rating) return '';
  return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}

function generateBookPageHTML(book, noteHtml) {
  const dateRead = book.dateRead
    ? book.dateRead.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(book.title)} — Library — Peter Skaronis</title>
    <meta name="description" content="My notes on ${escapeHtml(book.title)} by ${escapeHtml(book.author)}">
    <link rel="canonical" href="https://skaronis.com/library/${book.slug}/">

    <!-- Open Graph -->
    <meta property="og:type" content="article">
    <meta property="og:title" content="${escapeHtml(book.title)} — My Notes">
    <meta property="og:description" content="My notes on ${escapeHtml(book.title)} by ${escapeHtml(book.author)}">
    <meta property="og:url" content="https://skaronis.com/library/${book.slug}/">
    <meta property="og:site_name" content="Peter Skaronis">
    ${book.cover ? `<meta property="og:image" content="${escapeHtml(book.cover)}">` : ''}

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary">
    <meta name="twitter:site" content="@peter_skaronis">
    <meta name="twitter:title" content="${escapeHtml(book.title)} — My Notes">
    <meta name="twitter:description" content="My notes on ${escapeHtml(book.title)} by ${escapeHtml(book.author)}">

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
        ::selection { background: #fff; color: #000; }
        a {
            color: #fff;
            text-decoration: underline;
            text-decoration-thickness: 1px;
            text-underline-offset: 3px;
        }
        a:hover { text-decoration-thickness: 2px; }
        .container {
            max-width: 700px;
            margin: 0 auto;
            padding: 0 2rem;
        }
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
        .back-link:hover { color: #fff; }
        .book-header {
            display: flex;
            gap: 2rem;
            align-items: flex-start;
        }
        .book-cover {
            width: 140px;
            flex-shrink: 0;
        }
        .book-cover img {
            width: 100%;
            border-radius: 4px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        }
        .book-meta h1 {
            font-family: 'Instrument Serif', Georgia, serif;
            font-size: 2.2rem;
            font-weight: 400;
            line-height: 1.2;
            letter-spacing: -0.02em;
            color: #fff;
            margin-bottom: 0.5rem;
        }
        .book-author {
            font-size: 1.1rem;
            color: #888;
            margin-bottom: 0.75rem;
        }
        .book-rating {
            font-size: 1rem;
            color: #c45c3e;
            letter-spacing: 2px;
            margin-bottom: 0.5rem;
        }
        .book-date {
            font-size: 0.85rem;
            color: #555;
        }
        .goodreads-link {
            display: inline-block;
            margin-top: 1rem;
            font-size: 0.85rem;
            color: #666;
        }
        article {
            padding: 3rem 0;
            border-bottom: 1px solid #333;
        }
        article h2 {
            font-family: 'Instrument Serif', Georgia, serif;
            font-size: 1.6rem;
            font-weight: 400;
            color: #fff;
            margin: 2rem 0 1rem;
            letter-spacing: -0.02em;
        }
        article h2:first-child { margin-top: 0; }
        article h3 {
            font-family: 'Instrument Serif', Georgia, serif;
            font-size: 1.3rem;
            font-weight: 400;
            color: #fff;
            margin: 1.5rem 0 0.75rem;
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
        article li { margin-bottom: 0.5rem; }
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
        article strong { color: #fff; font-weight: 600; }
        footer {
            padding: 3rem 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .footer-links { display: flex; gap: 2rem; }
        .footer-links a { font-size: 0.9rem; color: #888; }
        .footer-links a:hover { color: #fff; }
        .copyright { font-size: 0.8rem; color: #444; }
        @media (max-width: 768px) {
            html { font-size: 16px; }
            .container { padding: 0 1.5rem; }
            header { padding: 3rem 0 2rem; }
            .book-header { flex-direction: column; gap: 1.5rem; }
            .book-cover { width: 120px; }
            .book-meta h1 { font-size: 1.8rem; }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <a href="/library.html" class="back-link">&larr; Back to library</a>
            <div class="book-header">
                ${book.cover ? `<div class="book-cover"><img src="${escapeHtml(book.cover)}" alt="${escapeHtml(book.title)}"></div>` : ''}
                <div class="book-meta">
                    <h1>${escapeHtml(book.title)}</h1>
                    <p class="book-author">${escapeHtml(book.author)}</p>
                    ${book.rating ? `<p class="book-rating">${generateStars(book.rating)}</p>` : ''}
                    ${dateRead ? `<p class="book-date">Read ${dateRead}</p>` : ''}
                    <a href="${escapeHtml(book.link)}" class="goodreads-link" target="_blank" rel="noopener">View on Goodreads &rarr;</a>
                </div>
            </div>
        </header>

        <article>
            <h2>My Notes</h2>
${noteHtml}
        </article>

        <footer>
            <div class="footer-links">
                <a href="/">Home</a>
                <a href="/now.html">Now</a>
                <a href="https://x.com/peter_skaronis">Twitter</a>
            </div>
            <p class="copyright">Made in Vancouver 🇨🇦</p>
        </footer>
    </div>
    <script src="/scripts/share-selection.js"></script>
</body>
</html>`;
}

function generateLibraryHTML(books) {
  // Sort by date read (most recent first), then by date added
  books.sort((a, b) => {
    const dateA = a.dateRead || a.dateAdded || new Date(0);
    const dateB = b.dateRead || b.dateAdded || new Date(0);
    return dateB - dateA;
  });

  let booksHTML = '';
  let notesCount = 0;
  for (const book of books) {
    const coverImg = book.cover
      ? `<img src="${escapeHtml(book.cover)}" alt="${escapeHtml(book.title)}" loading="lazy">`
      : `<div class="no-cover">${escapeHtml(book.title.charAt(0))}</div>`;

    if (book.note) notesCount++;
    const noteLink = book.note
      ? `\n                    <a href="/library/${book.slug}/" class="book-notes-link">Read notes &rarr;</a>`
      : '';

    booksHTML += `            <div class="book-card">
                <a href="${escapeHtml(book.link)}" class="book" target="_blank" rel="noopener">
                    ${coverImg}
                </a>
                <div class="book-info">
                    <p class="book-title">${escapeHtml(book.title)}</p>
                    <p class="book-author">${escapeHtml(book.author)}</p>
                    ${book.rating ? `<p class="book-rating">${generateStars(book.rating)}</p>` : ''}${noteLink}
                </div>
            </div>\n`;
  }
  console.log(`  Found ${notesCount} book note(s)`);

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Techimpossible Books - Free Books Resources</title>
    <meta name="description" content="Free books resources — curated book recommendations.">
    <link rel="canonical" href="https://skaronis.com/library.html">

    <!-- Open Graph -->
    <meta property="og:type" content="website">
    <meta property="og:title" content="Techimpossible Books - Free Books Resources">
    <meta property="og:description" content="Free books resources — curated book recommendations.">
    <meta property="og:url" content="https://skaronis.com/library.html">
    <meta property="og:site_name" content="Peter Skaronis">

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary">
    <meta name="twitter:site" content="@peter_skaronis">
    <meta name="twitter:title" content="Techimpossible Books - Free Books Resources">
    <meta name="twitter:description" content="Free books resources — curated book recommendations.">

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
            max-width: 1100px;
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

        .book-count {
            margin-top: 0.5rem;
            font-size: 0.9rem;
            color: #555;
        }

        /* Book grid */
        .book-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
            gap: 2rem;
            padding: 3rem 0;
            border-bottom: 1px solid #333;
        }

        .book-card {
            transition: transform 0.2s;
        }

        .book-card:hover {
            transform: translateY(-4px);
        }

        .book {
            text-decoration: none;
            display: block;
        }

        .book:hover {
            text-decoration: none;
            opacity: 0.9;
        }

        .book img {
            width: 100%;
            aspect-ratio: 2/3;
            object-fit: cover;
            border-radius: 4px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        }

        .no-cover {
            width: 100%;
            aspect-ratio: 2/3;
            background: #1a1a1a;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Instrument Serif', Georgia, serif;
            font-size: 2rem;
            color: #333;
        }

        .book-info {
            margin-top: 0.75rem;
        }

        .book-title {
            font-family: 'Instrument Serif', Georgia, serif;
            font-size: 1rem;
            color: #fff;
            line-height: 1.3;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }

        .book-author {
            font-size: 0.8rem;
            color: #666;
            margin-top: 0.25rem;
        }

        .book-rating {
            font-size: 0.75rem;
            color: #c45c3e;
            margin-top: 0.25rem;
            letter-spacing: 1px;
        }

        .book-notes-link {
            display: inline-block;
            font-size: 0.75rem;
            color: #c45c3e;
            margin-top: 0.5rem;
            text-decoration: none;
        }

        .book-notes-link:hover {
            text-decoration: underline;
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

            .book-grid {
                grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
                gap: 1rem;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <a href="index.html" class="back-link">&larr; Back home</a>
            <h1>Techimpossible Books - Free Books Resources</h1>
            <p>Free books resources. Synced from <a href="https://www.goodreads.com/user/show/${GOODREADS_USER_ID}" target="_blank" rel="noopener">Goodreads</a>.</p>
            <p class="book-count">${books.length} books · <a href="/library/notes/">View annotated books</a></p>
        </header>

        <div class="book-grid">
${booksHTML}        </div>

        <footer>
            <div class="footer-links">
                <a href="/">Home</a>
                <a href="/now.html">Now</a>
                <a href="https://x.com/peter_skaronis">Twitter</a>
            </div>
            <p class="copyright">Made in Vancouver 🇨🇦</p>
        </footer>
    </div>
    <script src="/scripts/share-selection.js"></script>
</body>
</html>`;
}

function generateNotesIndexHTML(books) {
  const booksWithNotes = books.filter(b => b.note);

  let booksHTML = '';
  for (const book of booksWithNotes) {
    const coverImg = book.cover
      ? `<img src="${escapeHtml(book.cover)}" alt="${escapeHtml(book.title)}" loading="lazy">`
      : `<div class="no-cover">${escapeHtml(book.title.charAt(0))}</div>`;

    booksHTML += `            <a href="/library/${book.slug}/" class="book-card">
                <div class="book-cover">
                    ${coverImg}
                </div>
                <div class="book-info">
                    <p class="book-title">${escapeHtml(book.title)}</p>
                    <p class="book-author">${escapeHtml(book.author)}</p>
                    ${book.rating ? `<p class="book-rating">${generateStars(book.rating)}</p>` : ''}
                </div>
            </a>\n`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Book Notes — Peter Skaronis</title>
    <meta name="description" content="Books I've read with my personal notes and takeaways.">
    <link rel="canonical" href="https://skaronis.com/library/notes/">

    <!-- Open Graph -->
    <meta property="og:type" content="website">
    <meta property="og:title" content="Book Notes — Peter Skaronis">
    <meta property="og:description" content="Books I've read with my personal notes and takeaways.">
    <meta property="og:url" content="https://skaronis.com/library/notes/">
    <meta property="og:site_name" content="Peter Skaronis">

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary">
    <meta name="twitter:site" content="@peter_skaronis">
    <meta name="twitter:title" content="Book Notes — Peter Skaronis">
    <meta name="twitter:description" content="Books I've read with my personal notes and takeaways.">

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
        ::selection { background: #fff; color: #000; }
        a {
            color: #fff;
            text-decoration: underline;
            text-decoration-thickness: 1px;
            text-underline-offset: 3px;
        }
        a:hover { text-decoration-thickness: 2px; }
        .container {
            max-width: 900px;
            margin: 0 auto;
            padding: 0 2rem;
        }
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
        .back-link:hover { color: #fff; }
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
        .book-count {
            margin-top: 0.5rem;
            font-size: 0.9rem;
            color: #555;
        }
        .book-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 2rem;
            padding: 3rem 0;
            border-bottom: 1px solid #333;
        }
        .book-card {
            display: flex;
            gap: 1.25rem;
            text-decoration: none;
            padding: 1.25rem;
            border-radius: 8px;
            transition: background 0.2s;
        }
        .book-card:hover {
            background: #1a1a1a;
            text-decoration: none;
        }
        .book-cover {
            width: 80px;
            flex-shrink: 0;
        }
        .book-cover img {
            width: 100%;
            aspect-ratio: 2/3;
            object-fit: cover;
            border-radius: 4px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        }
        .no-cover {
            width: 100%;
            aspect-ratio: 2/3;
            background: #1a1a1a;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Instrument Serif', Georgia, serif;
            font-size: 1.5rem;
            color: #333;
        }
        .book-info {
            display: flex;
            flex-direction: column;
            justify-content: center;
        }
        .book-title {
            font-family: 'Instrument Serif', Georgia, serif;
            font-size: 1.15rem;
            color: #fff;
            line-height: 1.3;
        }
        .book-author {
            font-size: 0.85rem;
            color: #666;
            margin-top: 0.25rem;
        }
        .book-rating {
            font-size: 0.75rem;
            color: #c45c3e;
            margin-top: 0.35rem;
            letter-spacing: 1px;
        }
        .empty-state {
            padding: 4rem 0;
            text-align: center;
            color: #666;
            border-bottom: 1px solid #333;
        }
        footer {
            padding: 3rem 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .footer-links { display: flex; gap: 2rem; }
        .footer-links a { font-size: 0.9rem; color: #888; }
        .footer-links a:hover { color: #fff; }
        .copyright { font-size: 0.8rem; color: #444; }
        @media (max-width: 768px) {
            html { font-size: 16px; }
            .container { padding: 0 1.5rem; }
            header { padding: 3rem 0 2rem; }
            header h1 { font-size: 2.5rem; }
            .book-grid { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <a href="/library.html" class="back-link">&larr; Back to library</a>
            <h1>Book Notes</h1>
            <p>Books I've annotated with personal notes and takeaways.</p>
            <p class="book-count">${booksWithNotes.length} book${booksWithNotes.length === 1 ? '' : 's'} with notes</p>
        </header>

        ${booksWithNotes.length === 0 ? '<div class="empty-state"><p>No book notes yet. Check back soon!</p></div>' : `<div class="book-grid">\n${booksHTML}        </div>`}

        <footer>
            <div class="footer-links">
                <a href="/">Home</a>
                <a href="/now.html">Now</a>
                <a href="https://x.com/peter_skaronis">Twitter</a>
            </div>
            <p class="copyright">Made in Vancouver 🇨🇦</p>
        </footer>
    </div>
    <script src="/scripts/share-selection.js"></script>
</body>
</html>`;
}

async function main() {
  console.log('Fetching Goodreads library...\n');

  try {
    console.log(`Fetching ${GOODREADS_RSS}...`);
    const xml = await fetch(GOODREADS_RSS);
    const books = parseGoodreadsRSS(xml);
    console.log(`  Found ${books.length} books`);

    if (books.length === 0) {
      console.error('No books found. Aborting.');
      process.exit(1);
    }

    // Generate individual book pages for books with notes
    ensureDir(LIBRARY_DIR);
    let pagesGenerated = 0;
    for (const book of books) {
      if (book.note) {
        const noteHtml = convertMarkdownToHtml(book.note);
        const pageHtml = generateBookPageHTML(book, noteHtml);
        const bookDir = path.join(LIBRARY_DIR, book.slug);
        ensureDir(bookDir);
        fs.writeFileSync(path.join(bookDir, 'index.html'), pageHtml);
        pagesGenerated++;
        console.log(`  Generated library/${book.slug}/index.html`);
      }
    }

    // Generate main library listing
    const html = generateLibraryHTML(books);
    fs.writeFileSync(OUTPUT_PATH, html);
    console.log(`\nGenerated library.html with ${books.length} books`);
    console.log(`Generated ${pagesGenerated} book detail page(s)`);

    // Generate notes index page
    const notesDir = path.join(LIBRARY_DIR, 'notes');
    ensureDir(notesDir);
    const notesHtml = generateNotesIndexHTML(books);
    fs.writeFileSync(path.join(notesDir, 'index.html'), notesHtml);
    console.log(`Generated library/notes/index.html`);

    console.log('\nDone!');
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
