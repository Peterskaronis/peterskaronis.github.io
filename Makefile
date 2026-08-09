# Blog commands

.PHONY: new build preview publish check test seo

# Create new post: make new title="My Post Title"
new:
	@./new-post "$(title)"

# Build blog locally
build: 
	@node scripts/update-blog.js
	@node scripts/update-footer.js
	@node scripts/update-seo.js

# Verify every page carries the canonical footer and current discovery tags
check:
	@node scripts/update-footer.js --check
	@node scripts/update-seo.js --check

# Run the content-script tests
test:
	@node scripts/test-scripts.js

# Regenerate llms.txt, sitemap and the discovery tags from site.json
seo:
	@node scripts/update-seo.js

# Build and preview (build + open in browser)
preview: build
	@open blog/index.html 2>/dev/null || xdg-open blog/index.html 2>/dev/null || echo "Open blog/index.html in your browser"

# Build, commit, and push
publish: test build
	@node scripts/update-posts.js
	@node scripts/update-footer.js
	@node scripts/update-seo.js
	@git add -A index.html archive.html about.html now.html quotes.html notes.html \
		claude-skills.html autofill.html awareness.html library.html library/ \
		posts/ blog/ blog-posts.json llms.txt sitemap.xml site.json
	@git commit -m "New blog post" || echo "Nothing to commit"
	@git push
