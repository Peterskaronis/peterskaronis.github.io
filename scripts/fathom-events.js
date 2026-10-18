// Fathom Analytics events for skaronis.com
// Loaded on every page by update-seo.js, right after the Fathom script.
// Only fixed event names are sent: never a URL, link text or selected text.
//
//   <body data-fathom-event="name">     fires once when the page loads (the 404 page)
//   <button data-fathom-click="name">   fires on click (share, tribute, demos)
//   links                               fire by destination (see linkEvent)
//   blog posts                          fire read-complete when the end of the article is reached

(function() {
    // Link destination -> event name. First match wins; anything else external is outbound-click.
    const DESTINATIONS = [
        [/(^|\.)substack\.com$|^blog\.skaronis\.com$/, 'substack-click'],
        [/^notes\.techimpossible\.com$/, 'notes-click'],
        [/(^|\.)techimpossible\.com$/, 'techimpossible-click'],
        [/(^|\.)linkedin\.com$/, 'linkedin-click'],
        [/(^|\.)(x|twitter)\.com$/, 'x-click'],
        [/(^|\.)goodreads\.com$/, 'goodreads-click'],
        [/(^|\.)amazon\.[a-z.]+$/, 'amazon-click'],
        [/(^|\.)youtube\.com$|^youtu\.be$/, 'youtube-click']
    ];
    const SITE_HOSTS = ['skaronis.com', 'www.skaronis.com'];

    function linkEvent(href, here) {
        let url;
        try { url = new URL(href, here); } catch (e) { return null; }
        if (url.protocol === 'mailto:') return 'email-click';
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
        const host = url.hostname.toLowerCase();
        if (host === here.hostname || SITE_HOSTS.includes(host)) {
            return /^\/skills\/[^/]+\.md$/.test(url.pathname) ? 'skill-download' : null;
        }
        for (const [pattern, name] of DESTINATIONS) {
            if (pattern.test(host)) return name;
        }
        return 'outbound-click';
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { linkEvent };   // for scripts/test-scripts.js
        return;
    }

    function track(name) {
        try { if (window.fathom && name) window.fathom.trackEvent(name); } catch (e) { /* blocked or not loaded */ }
    }

    const pageEvent = document.body && document.body.getAttribute('data-fathom-event');
    if (pageEvent) track(pageEvent);

    // Capture phase, so handlers that stop propagation (share popup, tribute) are still counted.
    document.addEventListener('click', function(e) {
        if (!(e.target instanceof Element)) return;
        const tagged = e.target.closest('[data-fathom-click]');
        if (tagged) return track(tagged.getAttribute('data-fathom-click'));
        const link = e.target.closest('a[href]');
        if (link) track(linkEvent(link.getAttribute('href'), window.location));
    }, true);

    const article = /^\/blog\/[^/]+\/?$/.test(window.location.pathname) && document.querySelector('article');
    if (article && 'IntersectionObserver' in window) {
        const end = document.createElement('div');
        end.setAttribute('aria-hidden', 'true');
        article.appendChild(end);
        const observer = new IntersectionObserver(function(entries) {
            if (entries.some(entry => entry.isIntersecting)) {
                track('read-complete');
                observer.disconnect();
            }
        });
        observer.observe(end);
    }
})();
