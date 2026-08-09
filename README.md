# skaronis.com

Personal website with a self-hosted blog that automatically syncs from Substack.

## Philosophy

Platforms come and go. Your words should stay.

This system lets me write on Substack (where my subscribers are) while automatically maintaining a local copy of everything as markdown files. If Substack disappears tomorrow, my content lives on.

**No database. No framework. No dependencies that break. Just text files that will open in 50 years.**

## Architecture

```
Substack → RSS Feed → GitHub Action → Markdown → Static HTML → GitHub Pages
```

Every two hours, a GitHub Action:
1. Fetches RSS feeds from my Substacks
2. Converts new posts to markdown
3. Builds static HTML pages
4. Commits and deploys to GitHub Pages

## Directory Structure

```
├── index.html              # Homepage
├── archive.html            # All posts listing (generated)
├── posts/                  # Markdown source files
│   ├── 2026-01-20-why-i-built-my-own-blog.md
│   └── ...
├── blog/                   # Generated HTML pages
│   ├── why-i-built-my-own-blog/
│   │   └── index.html
│   └── ...
├── scripts/
│   ├── update-posts.js     # RSS importer
│   ├── update-blog.js      # Markdown → HTML builder
│   └── ...
└── .github/workflows/
    └── update-posts.yml    # Automation workflow
```

## Scripts

### update-posts.js — The Importer

Fetches RSS feeds and converts Substack HTML to clean markdown.

**What it does:**
- Fetches RSS from configured feeds
- Extracts full content from `<content:encoded>`
- Converts HTML to markdown (images, blockquotes, lists, formatting)
- Strips Substack boilerplate ("Subscribe to...", "Thanks for reading...")
- Creates markdown files with YAML frontmatter
- Adds attribution link to original post
- Updates `index.html` with latest post
- Regenerates `archive.html`

**Configuration:**
```javascript
const FEEDS = [
  {
    url: 'https://blog.skaronis.com/feed',
    source: 'Essays',
    siteName: 'Substack',
    importContent: true  // Import full content to local markdown
  },
  {
    url: 'https://notes.techimpossible.com/feed',
    source: 'Technical',
    siteName: 'Cybersecurity Notes',
    importContent: true
  }
];
```

### update-blog.js — The Builder

Converts markdown files to static HTML pages.

**What it does:**
- Reads all `.md` files from `posts/`
- Parses YAML frontmatter (title, date, slug, description)
- Converts markdown to HTML
- Generates `blog/[slug]/index.html` for each post
- Generates `blog/index.html` listing all posts
- Exports `blog-posts.json` for integration

**Markdown format:**
```markdown
---
title: "Your Post Title"
date: 2026-01-20
slug: your-post-title
description: "A brief description"
original_url: https://blog.skaronis.com/p/your-post  # optional
---

Your content here...
```

## Writing a New Post

### Option 1: Write on Substack (Recommended)

Just publish on Substack. Within about two hours the post is imported, converted to markdown and deployed. To publish it immediately, run the "Update Content" workflow manually from the Actions tab.

### Option 2: Write Locally

Create a markdown file in `posts/`:

```bash
cat > posts/$(date +%Y-%m-%d)-your-slug.md << 'EOF'
---
title: "Your Post Title"
date: $(date +%Y-%m-%d)
slug: your-slug
description: "Brief description"
---

Your content here...
EOF
```

Or use the helper script:
```bash
./new-post "Your Post Title"
```

Then build:
```bash
node scripts/update-blog.js
```

## Building Locally

```bash
# Import from RSS and rebuild everything
node scripts/update-posts.js
node scripts/update-blog.js

# Or just rebuild from existing markdown
node scripts/update-blog.js
```

## GitHub Action

The workflow runs every two hours, at :17:

Defined in [`.github/workflows/update-posts.yml`](.github/workflows/update-posts.yml).
It is not reproduced here: a second copy in the README only drifts from the
real one.

Steps, in order:

1. `test-scripts.js` — runs first, so a broken script fails before it writes
2. `update-blog.js` — build HTML from any markdown in `posts/`
3. `update-posts.js` — import new RSS content to markdown, rewrite the homepage blocks and `archive.html`
4. `update-blog.js` again — render the markdown the previous step just imported
5. `update-library.js` — Goodreads (currently 403s from CI; warns and continues)
6. `update-footer.js` — one footer on every page, including the ones just generated
7. `update-seo.js` — `llms.txt`, `sitemap.xml` and the per-page discovery tags
8. commit and push, only if something actually changed

Steps 6 and 7 run last on purpose: the generators above them emit pages from
their own templates, so normalising afterwards means those templates never need
to know about the footer or the meta tags.

## HTML to Markdown Conversion

The importer handles Substack's complex HTML:

- **Images**: Extracts from `<picture>` elements, preserves hero images
- **Formatting**: Bold, italic, with cleanup for split/nested tags
- **Blockquotes**: Proper `>` prefix formatting
- **Lists**: Ordered and unordered
- **Code blocks**: Fenced with language hints
- **Cleanup**: Removes `<br>` inside tags, decodes HTML entities, strips boilerplate

## Customization

### Adding a New Feed

Edit `scripts/update-posts.js`:

```javascript
const FEEDS = [
  // ... existing feeds
  {
    url: 'https://your-substack.substack.com/feed',
    source: 'Your Label',
    sourceClass: 'your-class',
    siteName: 'Your Site Name',
    useForLatest: false,  // Show in "Latest Post" on homepage?
    importContent: true   // Import full content or just link?
  }
];
```

### Styling

All styles are inline in the generated HTML. Edit the template strings in:
- `scripts/update-blog.js` — Blog post pages
- `scripts/update-posts.js` — Archive page

### Homepage

Edit `index.html` directly. The "Latest Post" section is automatically updated by `update-posts.js`.

## Dependencies

**Zero npm dependencies.** The scripts use only Node.js built-in modules:
- `fs` — File system operations
- `path` — Path manipulation
- `https` — Fetching RSS feeds

## Why This Approach?

1. **Ownership** — Content lives in my repository as plain text
2. **Durability** — Markdown and HTML will outlive any framework
3. **Simplicity** — Three scripts, zero dependencies, readable code
4. **Speed** — Static files, no database, instant page loads
5. **Flexibility** — Write on Substack or locally, same result

## License

Content is copyrighted. Code is MIT licensed — feel free to adapt for your own site.
