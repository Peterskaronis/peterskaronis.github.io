# Blog commands

.PHONY: new build preview publish

# Create new post: make new title="My Post Title"
new:
	@./new-post "$(title)"

# Build blog locally
build:
	@node scripts/update-blog.js

# Build and preview (build + open in browser)
preview: build
	@open blog/index.html 2>/dev/null || xdg-open blog/index.html 2>/dev/null || echo "Open blog/index.html in your browser"

# Build, commit, and push
publish: build
	@node scripts/update-posts.js
	@git add posts/ blog/ blog-posts.json index.html archive.html
	@git commit -m "New blog post" || echo "Nothing to commit"
	@git push
