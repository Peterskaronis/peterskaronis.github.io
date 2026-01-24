/**
 * Share selected text to X (Twitter)
 * Include this script on any page to enable text selection sharing.
 */
(function() {
    // Create the share popup
    const popup = document.createElement('div');
    popup.id = 'share-popup';
    popup.innerHTML = '<button id="share-x-btn" title="Share on X">𝕏</button>';
    popup.style.cssText = `
        position: absolute;
        display: none;
        background: #fff;
        border-radius: 4px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        z-index: 10000;
        padding: 4px;
    `;

    const btn = popup.querySelector('#share-x-btn');
    btn.style.cssText = `
        background: #000;
        color: #fff;
        border: none;
        padding: 8px 12px;
        font-size: 14px;
        font-weight: bold;
        cursor: pointer;
        border-radius: 3px;
        font-family: -apple-system, sans-serif;
    `;

    document.body.appendChild(popup);

    let selectedText = '';

    // Show popup on text selection
    document.addEventListener('mouseup', function(e) {
        setTimeout(function() {
            const selection = window.getSelection();
            const text = selection.toString().trim();

            if (text.length > 5 && text.length < 280) {
                selectedText = text;

                // Position popup near selection
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();

                popup.style.display = 'block';
                popup.style.left = (rect.left + window.scrollX + (rect.width / 2) - 20) + 'px';
                popup.style.top = (rect.top + window.scrollY - 45) + 'px';
            } else {
                popup.style.display = 'none';
            }
        }, 10);
    });

    // Hide popup when clicking elsewhere
    document.addEventListener('mousedown', function(e) {
        if (!popup.contains(e.target)) {
            popup.style.display = 'none';
        }
    });

    // Share to X when button clicked
    btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();

        const url = 'https://skaronis.com' + window.location.pathname;
        const tweetText = `"${selectedText}" — @peter_skaronis`;
        const shareUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(url)}`;

        window.open(shareUrl, '_blank', 'width=550,height=420');
        popup.style.display = 'none';
    });
})();
