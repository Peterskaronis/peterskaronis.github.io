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

Every 15 minutes, a GitHub Action:
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

Just publish on Substack. Within 15 minutes, the post will be automatically imported, converted to markdown, and deployed.

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

The workflow runs every 15 minutes:

```yaml
name: Update Content

on:
  schedule:
    - cron: '*/15 * * * *'
  workflow_dispatch:  # Manual trigger

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: node scripts/update-blog.js
      - run: node scripts/update-posts.js
      - run: node scripts/update-blog.js
      - name: Commit changes
        run: |
          git diff --quiet && git diff --cached --quiet || (
            git config user.name "github-actions[bot]"
            git config user.email "github-actions[bot]@users.noreply.github.com"
            git add posts/ blog/ index.html archive.html blog-posts.json
            git commit -m "Update content from feeds"
            git push
          )
```

**Why run update-blog.js twice?**
1. First run: Process any manually added markdown files
2. update-posts.js: Import new RSS content to markdown
3. Second run: Process newly imported markdown

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
