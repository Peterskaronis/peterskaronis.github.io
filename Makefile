# Blog commands

.PHONY: new build preview publish check-footer test

# Create new post: make new title="My Post Title"
new:
	@./new-post "$(title)"

# Build blog locally
build:
	@node scripts/update-blog.js
	@node scripts/update-footer.js

# Verify every page carries the canonical footer
check-footer:
	@node scripts/update-footer.js --check

# Run the content-script tests
test:
	@node scripts/test-scripts.js

# Build and preview (build + open in browser)
preview: build
	@open blog/index.html 2>/dev/null || xdg-open blog/index.html 2>/dev/null || echo "Open blog/index.html in your browser"

# Build, commit, and push
publish: build
	@node scripts/update-posts.js
	@node scripts/update-footer.js
	@git add posts/ blog/ blog-posts.json index.html archive.html
	@git commit -m "New blog post" || echo "Nothing to commit"
	@git push
