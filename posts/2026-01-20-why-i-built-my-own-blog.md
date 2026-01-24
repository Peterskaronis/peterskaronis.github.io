---
title: "Why I Built My Own Blog"
date: 2026-01-20
slug: why-i-built-my-own-blog
description: "Owning your content matters more than ever."
---

Platforms come and go. Your words should stay.

## The Problem

Every few years, a platform dies or changes its rules:

- Google Reader shut down
- Medium paywalled everything
- Twitter became... whatever it is now

Your content shouldn't depend on someone else's business model.

## The Solution

A folder of markdown files. That's it.

No database. No framework. No dependencies that break.

Just text files that will open in 50 years.

## The Architecture

I still write on Substack. It's where my subscribers are, where the discussion happens, and where the writing workflow works best.

But every 15 minutes, a GitHub Action wakes up and does something simple: it checks my RSS feeds, pulls in any new posts, converts them to markdown, and commits them to my repository.

```
Substack → RSS Feed → GitHub Action → Markdown → Static HTML → My Domain
```

The result: I publish where it's convenient, but I own where it matters.

## How It Works

The system has three scripts that run in sequence:

**1. update-posts.js** — The Importer

This script fetches my RSS feeds (personal Substack and Cybersecurity Notes), extracts the full content from `<content:encoded>`, and converts Substack's messy HTML into clean markdown.

It handles:
- Hero images preserved from Substack CDN
- Blockquotes, code blocks, lists
- Bold, italic, and nested formatting
- Stripping Substack boilerplate ("Subscribe to...", "Thanks for reading...")

Each imported post gets YAML frontmatter with title, date, slug, and a link back to the original.

Every post ends with: *Originally published on Substack*

Credit where it's due. But the words live here now.

**2. update-blog.js** — The Builder

This script reads the `posts/` directory, parses each markdown file, and generates static HTML pages in `blog/`.

No build tools. No npm install. Just Node.js reading files and writing files.

The HTML is self-contained — fonts, styles, everything inline. Each post is a single HTML file that will render in any browser, forever.

**3. The GitHub Action**

```yaml
name: Update Content

on:
  schedule:
    - cron: '*/15 * * * *'
  workflow_dispatch:

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Build blog from markdown
        run: node scripts/update-blog.js
      - name: Import posts from RSS feeds
        run: node scripts/update-posts.js
      - name: Rebuild blog with imported posts
        run: node scripts/update-blog.js
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

Every 15 minutes. Automatically. No server to maintain.

## What I Gained

**Ownership** — Every post exists as a markdown file in my repository. If GitHub disappears tomorrow, I have local copies. If Substack changes their terms, my content is already elsewhere.

**Durability** — HTML and markdown are the cockroaches of file formats. They'll survive every framework cycle, every JavaScript fatigue wave, every new paradigm.

**Speed** — Static files served from GitHub Pages. No database queries. No cold starts. Just bytes over the wire.

**Simplicity** — The entire system is three JavaScript files with zero dependencies. I can read every line and understand what it does.

## What I Kept

**Substack for writing** — The editor is good. The email delivery works. The community exists. I don't need to rebuild what's already solved.

**Comments and discussion** — They happen on the original Substack post. The attribution link at the bottom of each post takes readers there.

**Email subscriptions** — Substack handles this. I don't need another service to manage.

## The Philosophy

There's a quote I keep coming back to: "The best time to plant a tree was 20 years ago. The second best time is now."

I can't go back and own my content from the beginning. But I can start now. Every post from this point forward lives in two places: where it's convenient and where I control it.

The infrastructure took an afternoon to build. The markdown files will last decades.

That's the trade I'm making.

---

*The code for this system is open source at [github.com/peterskaronis/peterskaronis.github.io](https://github.com/peterskaronis/peterskaronis.github.io)*
