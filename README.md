# skaronis.com

Personal website with a self-hosted blog.

## Structure

- `index.html` — Homepage
- `blog/` — Self-hosted blog posts (generated)
- `archive.html` — All writing (Substack + Cybersecurity Notes + Blog)
- `posts/` — Markdown source files for blog

## Writing a Blog Post

```bash
./new-post "Your Post Title"
```

This creates `posts/YYYY-MM-DD-slug.md` with frontmatter pre-filled.

## Building Locally

```bash
node scripts/update-blog.js    # Convert markdown to HTML
node scripts/update-posts.js   # Regenerate archive with RSS feeds
```

## Automation

GitHub Actions runs every 15 minutes to:
1. Build blog from markdown
2. Fetch RSS feeds from Substack and Cybersecurity Notes
3. Update homepage and archive
