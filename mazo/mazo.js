/* 33 Σκαλιά · a tribute to Giorgos Mazonakis
 * Vanilla JS, no build step. Every piece of data reaches the DOM through
 * textContent or validated attributes, never through innerHTML.
 */
(function () {
    'use strict';

    var doc = document;
    var root = doc.documentElement;
    var body = doc.body;
    var $ = function (sel) { return doc.querySelector(sel); };

    var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
    var reduced = reduceMQ.matches;

    var TOTAL = 33;
    var END = 34.2;          // camera index where the finale starts to scroll in
    var FOCUS_MS = 700;      // a step must hold the centre this long to be focused
    var SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
    var YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

    var REALMS = [
        { upTo: 8, el: 'Η Άβυσσος', en: 'The Abyss' },
        { upTo: 14, el: 'Η Νύχτα της Γης', en: 'The Earthly Night' },
        { upTo: 20, el: 'Ο Ανήφορος', en: 'The Ascent' },
        { upTo: 28, el: 'Ο Όρθρος', en: 'The Dawn' },
        { upTo: 33, el: 'Το Ανέσπερο Φως', en: 'The Never-setting Light' }
    ];
    // Backdrop plates by altitude (step index at the centre of each plate).
    var PLATES = [
        { key: 'abyss', at: 0, until: 8 },
        { key: 'earth', at: 9, until: 20 },
        { key: 'dawn', at: 21, until: 28 },
        { key: 'heaven', at: 29, until: 34 }
    ];

    var S = {
        steps: [],           // { n, data, el, img, loaded }
        byN: {},
        p: 0, c: -1,
        stepPx: 1, off0: 0, zeroShift: 0, zeroTall: false,
        mode: 'stair',
        geo: null,
        focused: 0, cand: 0, candSince: 0,
        opened: false, opening: false,
        muted: false,
        controller: null, apiRequested: false, currentUri: null, wantUri: null,
        paused: true, retryTimer: 0,
        dirty: true,
        realm: ''
    };

    try { S.muted = window.localStorage.getItem('mazo-muted') === '1'; } catch (e) { S.muted = false; }
    function saveMuted() {
        try { window.localStorage.setItem('mazo-muted', S.muted ? '1' : '0'); } catch (e) { /* private mode */ }
    }

    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

    var els = {
        door: $('#door'), open: $('#open'), status: $('#door-status'),
        stage: $('#stage'), viewport: $('#viewport'), threshold: $('#threshold'),
        scroller: $('#scroller'), light: $('#light'), realm: $('#realm'), rope: $('#rope'),
        finale: $('#finale'), indexList: $('#index-list'), again: $('#again'),
        dock: $('#dock'), dockNum: $('#dock-num'), dockTitle: $('#dock-title'), dockLat: $('#dock-lat'), dockYt: $('#dock-yt'),
        mute: $('#mute'), embed: $('#embed'), candle: $('#candle'), motes: $('#motes')
    };
    var plates = Array.prototype.slice.call(doc.querySelectorAll('.plate'));

    function el(tag, cls, text) {
        var e = doc.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = String(text);
        return e;
    }
    function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
    function smooth(a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

    /* ---------------------------------------------------------------- data */

    function clean(raw) {
        if (!raw || !Array.isArray(raw.steps)) throw new Error('bad data');
        return raw.steps.slice(0, TOTAL).map(function (s, i) {
            var n = i + 1;
            if (Number(s.n) !== n) throw new Error('step order');
            var str = function (v) { return typeof v === 'string' ? v : ''; };
            var img = str(s.img), imgSm = str(s.img_sm);
            if (!/^img\/[a-z0-9_-]+\.webp$/.test(img) || !/^img\/[a-z0-9_-]+\.webp$/.test(imgSm)) throw new Error('image path');
            return {
                n: n,
                numeral: str(s.numeral),
                el: str(s.title_el), lat: str(s.title_lat), en: str(s.title_en),
                year: parseInt(s.year, 10) || '',
                album: str(s.album),
                peak: s.peak === true,
                mood: str(s.mood), alt: str(s.alt),
                spotify: SPOTIFY_ID.test(str(s.spotify)) ? s.spotify : null,
                youtube: YOUTUBE_ID.test(str(s.youtube)) ? s.youtube : null,
                img: img, imgSm: imgSm,
                w: parseInt(s.w, 10) || 773, h: parseInt(s.h, 10) || 960
            };
        });
    }

    fetch('data/steps.json', { credentials: 'same-origin' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (raw) { build(clean(raw)); })
        .catch(function () {
            els.status.textContent = 'The steps could not be loaded. Please reload the page.';
        });

    /* ---------------------------------------------------------------- build */

    function ytUrl(id) { return 'https://www.youtube.com/watch?v=' + encodeURIComponent(id); }

    function build(list) {
        var frag = doc.createDocumentFragment();
        var ropeFrag = doc.createDocumentFragment();
        var idxFrag = doc.createDocumentFragment();

        list.forEach(function (d) {
            var art = el('article', 'step' + (d.peak ? ' is-peak' : ''));
            art.id = 'step-' + d.n;
            art.dataset.n = String(d.n);
            art.setAttribute('aria-labelledby', 'st-' + d.n);

            if (d.peak) art.appendChild(el('span', 'halo'));

            var fig = el('figure', 'frame');
            var img = el('img');
            img.alt = d.alt;
            img.width = d.w; img.height = d.h;
            img.decoding = 'async';
            fig.appendChild(img);
            art.appendChild(fig);

            var block = el('div', 'block');
            block.setAttribute('aria-hidden', 'true');
            block.appendChild(el('div', 'tread'));
            var riser = el('div', 'riser');
            riser.appendChild(el('span', 'carved', d.numeral));
            block.appendChild(riser);
            art.appendChild(block);

            var cap = el('div', 'cap');
            var panel = el('div', 'cap-panel');
            var num = el('p', 'num');
            var numVis = el('span', null, d.numeral);
            numVis.setAttribute('aria-hidden', 'true');
            num.appendChild(numVis);
            num.appendChild(el('span', 'vh', 'Step ' + d.n + ' of ' + TOTAL));
            panel.appendChild(num);
            if (d.peak) {
                var sm = el('p', 'summit');
                var smEl = el('span', null, 'Κορυφή');
                smEl.lang = 'el';
                sm.appendChild(smEl);
                sm.appendChild(doc.createTextNode(' · Summit'));
                panel.appendChild(sm);
            }
            var h = el('h3', null, d.el);
            h.id = 'st-' + d.n;
            h.lang = 'el';
            panel.appendChild(h);
            panel.appendChild(el('p', 'lat', d.lat));
            var meta = el('p', 'meta');
            meta.appendChild(doc.createTextNode(d.year + ' · '));
            var alb = el('span', null, d.album);
            if (/[Ͱ-Ͽ]/.test(d.album) && !/^Single/.test(d.album)) alb.lang = 'el';
            meta.appendChild(alb);
            panel.appendChild(meta);
            panel.appendChild(el('p', 'mood', d.mood));

            var actions = el('p', 'actions');
            if (d.spotify) {
                var b = el('button', 'play');
                b.type = 'button';
                b.appendChild(el('span', 'tri', '▶')).setAttribute('aria-hidden', 'true');
                var bl = el('span', null, 'Άκου');
                bl.lang = 'el';
                b.appendChild(bl);
                b.appendChild(doc.createTextNode(' · Play'));
                b.appendChild(el('span', 'vh', ' ' + d.lat));
                b.addEventListener('click', function (ev) { ev.stopPropagation(); goTo(d.n, true); play(d.n, true); });
                b.addEventListener('focus', function () { if (Math.round(S.c) !== d.n) goTo(d.n, true); });
                actions.appendChild(b);
            } else if (d.youtube) {
                var a = el('a', 'yt', 'Listen on YouTube');
                a.href = ytUrl(d.youtube);
                a.rel = 'noopener noreferrer';
                a.target = '_blank';
                a.addEventListener('focus', function () { if (Math.round(S.c) !== d.n) goTo(d.n, true); });
                actions.appendChild(a);
            }
            panel.appendChild(actions);
            if (d.n === TOTAL) {
                var om = el('span', 'omega-mark', 'Ω');
                om.setAttribute('aria-hidden', 'true');
                panel.appendChild(om);
            }
            cap.appendChild(panel);
            art.appendChild(cap);

            fig.addEventListener('click', function () {
                if (S.focused === d.n) play(d.n, true); else goTo(d.n);
            });

            frag.appendChild(art);
            var s = { n: d.n, data: d, el: art, img: img, cap: cap, loaded: false };
            S.steps.push(s);
            S.byN[d.n] = s;

            var knot = el('li', d.peak ? 'peak' : '');
            ropeFrag.appendChild(knot);
            s.knot = knot;

            var li = el('li');
            var link = el('a');
            link.href = '#step-' + d.n;
            var n1 = el('span', 'n', d.numeral);
            n1.setAttribute('aria-hidden', 'true');
            link.appendChild(n1);
            var t = el('span', 't', d.el);
            t.lang = 'el';
            link.appendChild(t);
            if (d.peak) {
                var pk = el('span', 'pk', 'Summit');
                pk.lang = 'en';
                t.appendChild(doc.createTextNode(' '));
                t.appendChild(pk);
            }
            link.appendChild(el('span', 's', d.lat + ', ' + d.year));
            link.addEventListener('click', function (ev) { ev.preventDefault(); jumpTo(d.n); });
            li.appendChild(link);
            idxFrag.appendChild(li);
        });

        els.viewport.appendChild(frag);
        els.rope.appendChild(ropeFrag);
        els.indexList.appendChild(idxFrag);

        // The threshold behaves as step zero.
        S.zero = { n: 0, el: els.threshold, isZero: true };

        setMuteUi();
        layout();
        if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { layout(); });
        els.open.disabled = false;
        els.open.addEventListener('click', openDoor);
        startCandle();
    }

    /* ---------------------------------------------------------------- layout */

    function layout() {
        var vw = window.innerWidth;
        var vh = window.innerHeight;
        // Measure the dock as it really is (its second row on phones makes it
        // taller than the CSS estimate), and publish that height to the CSS.
        root.style.removeProperty('--dock-h');
        var dockH = parseFloat(getComputedStyle(root).getPropertyValue('--dock-h')) || 92;
        if (!els.dock.hidden && els.dock.offsetHeight) {
            dockH = Math.max(dockH, els.dock.offsetHeight);
            root.style.setProperty('--dock-h', dockH + 'px');
        }
        var usable = vh - dockH;
        var mode = reduced ? 'fade' : (vw >= 760 && vh >= 540 ? 'stair' : 'column');
        S.mode = mode;
        root.dataset.mode = mode;

        var g = {};
        if (mode === 'stair') {
            g.cardH = Math.min(usable * 0.64, 640);
            g.cardW = g.cardH * 0.806;
            g.ox = vw * 0.57; g.oy = usable * 0.46;
            g.dx = vw * 0.27; g.dy = usable * 0.42; g.dz = 360;
            g.rot = -8;
            S.stepPx = Math.round(vh * 0.9);
        } else {
            // The caption sits under the painting, so size every painting to
            // leave room for the tallest caption above the dock.
            var capH = 0;
            for (var i = 0; i < S.steps.length; i++) capH = Math.max(capH, S.steps[i].cap.offsetHeight);
            if (!capH) capH = vh < 700 ? 206 : 232;
            var avail = usable - (capH + 10) - 44 - 8;
            g.cardW = Math.min(vw * 0.84, avail * 0.806, 520);
            g.cardH = g.cardW / 0.806;
            g.ox = vw / 2;
            g.oy = 44 + g.cardH / 2 + Math.max(0, (avail - g.cardH) / 2);
            g.dx = 0; g.dy = mode === 'column' ? usable : 0; g.dz = 0; g.rot = 0;
            S.stepPx = Math.round(mode === 'column' ? usable : vh * 0.8);
        }
        g.vw = vw; g.vh = vh; g.usable = usable;
        S.geo = g;
        els.stage.style.setProperty('--card-w', g.cardW.toFixed(1) + 'px');
        els.stage.style.setProperty('--card-h', g.cardH.toFixed(1) + 'px');
        els.viewport.style.perspectiveOrigin = (g.ox / vw * 100).toFixed(2) + '% ' + (g.oy / usable * 100).toFixed(2) + '%';
        S.zeroW = els.threshold.offsetWidth;
        S.zeroH = els.threshold.offsetHeight;
        // A threshold taller than the screen is read first, as ordinary
        // scrolling, before the camera starts to climb.
        S.zeroTall = S.zeroH + 32 > usable;
        S.off0 = S.zeroTall ? Math.ceil(S.zeroH + 40 - usable) : 0;

        els.scroller.style.height = Math.round(S.off0 + END * S.stepPx + vh) + 'px';
        S.dirty = true;
        if (S.opened && S.c >= 0 && S.p <= TOTAL) window.scrollTo(0, scrollFor(S.c));
    }

    var resizeT = 0;
    window.addEventListener('resize', function () {
        clearTimeout(resizeT);
        resizeT = setTimeout(function () { layout(); sizeMotes(); sizeCandle(); }, 120);
    });
    var onReduce = function (e) { reduced = e.matches; layout(); };
    if (reduceMQ.addEventListener) reduceMQ.addEventListener('change', onReduce);

    function scrollFor(k) { return k <= 0 ? 0 : Math.round(S.off0 + k * S.stepPx); }

    /* Settle on a step. When scrolling stops between two steps, finish the
     * move in the direction of travel, so a flick, a swipe or a single wheel
     * notch always lands on a painting. (CSS proximity snapping pulled slow
     * wheel notches back to the same step, so the climb could stall.) */
    var settleT = 0, lastY = 0, dir = 0, touching = false;
    function settle() {
        if (!S.opened || touching) return;
        var y = window.scrollY;
        if (y <= S.off0 + 1 || y >= scrollFor(TOTAL) - 1) return;   // reading the threshold, or past the last step
        var p = (y - S.off0) / S.stepPx;
        var near = Math.round(p);
        if (Math.abs(p - near) * S.stepPx < 2) return;
        var k = dir > 0 ? Math.ceil(p - 0.1) : dir < 0 ? Math.floor(p + 0.1) : near;
        k = clamp(k, 0, TOTAL);
        window.scrollTo({ top: k === 0 ? S.off0 : scrollFor(k), behavior: reduced ? 'auto' : 'smooth' });
    }
    function queueSettle() { clearTimeout(settleT); if (!touching) settleT = setTimeout(settle, 180); }
    window.addEventListener('scroll', function () {
        var y = window.scrollY;
        if (y !== lastY) { dir = y > lastY ? 1 : -1; lastY = y; }
        queueSettle();
    }, { passive: true });
    window.addEventListener('touchstart', function () { touching = true; clearTimeout(settleT); }, { passive: true });
    var touchDone = function () { touching = false; queueSettle(); };
    window.addEventListener('touchend', touchDone, { passive: true });
    window.addEventListener('touchcancel', touchDone, { passive: true });

    /* ---------------------------------------------------------------- camera */

    function place(s, rel, g) {
        var isZero = s.isZero;
        var w = isZero ? S.zeroW : g.cardW;
        var hgt = isZero ? S.zeroH : g.cardH;
        var x = rel * g.dx, y = -rel * g.dy, z = -rel * g.dz;
        var op, near;
        if (S.mode === 'stair') {
            op = rel < 0 ? clamp(1 + rel * 1.05, 0, 1) : clamp(1 - (rel - 2.6) / 1.6, 0, 1);
            near = clamp(1 - Math.abs(rel) * 2.2, 0, 1);
        } else if (S.mode === 'column') {
            op = rel < 0 ? clamp(1 + rel * 1.7, 0, 1) : clamp(1.25 - rel * 0.9, 0, 1);
            near = clamp(1 - Math.abs(rel) * 1.6, 0, 1);
        } else {
            op = clamp(1 - Math.abs(rel) * 1.7, 0, 1);
            near = op;
        }
        // Neighbours stay visible (if transparent) so Tab can reach them.
        var visible = op > 0.01 || Math.abs(rel) <= 1.01;
        if (visible !== s.vis) {
            s.vis = visible;
            s.el.classList.toggle('is-near', visible);
            if (isZero) s.el.style.visibility = visible ? 'visible' : 'hidden';
        }
        if (!visible) return;
        s.el.style.pointerEvents = op < 0.05 ? 'none' : '';
        var cx = isZero && S.mode === 'stair' ? g.vw * 0.5 : g.ox;
        var cy = g.oy;
        if (isZero) cy = S.zeroTall ? 16 + hgt / 2 - S.zeroShift : g.usable / 2;
        s.el.style.transform = 'translate3d(' + (cx + x - w / 2).toFixed(1) + 'px,' + (cy + y - hgt / 2).toFixed(1) + 'px,' + z.toFixed(1) + 'px)' +
            (g.rot && !isZero ? ' rotateY(' + g.rot + 'deg)' : '');
        s.el.style.opacity = op.toFixed(3);
        if (!isZero) s.el.style.setProperty('--near', near.toFixed(3));

        if (!isZero && !s.loaded && Math.abs(rel) <= 3.2) {
            s.loaded = true;
            var d = s.data;
            s.img.sizes = Math.ceil(g.cardW) + 'px';
            s.img.srcset = d.imgSm + ' 386w, ' + d.img + ' 773w';
            s.img.src = d.img;
        }
    }

    function render(now) {
        var g = S.geo;
        if (!g) return;
        var sy = window.scrollY;
        var p = Math.max(0, sy - S.off0) / S.stepPx;
        S.p = p;
        var c = clamp(p, 0, TOTAL);
        var shift = Math.min(sy, S.off0);
        if (shift !== S.zeroShift) { S.zeroShift = shift; S.dirty = true; }
        if (c !== S.c || S.dirty) {
            S.c = c;
            S.dirty = false;
            place(S.zero, 0 - c, g);
            for (var i = 0; i < S.steps.length; i++) place(S.steps[i], S.steps[i].n - c, g);
            updatePlates(c);
            updateRope(c);
        }
        // Dissolve into light after the last step.
        var lightOp = smooth(TOTAL + 0.3, TOTAL + 1.0, p);
        if (lightOp !== S.lightOp) {
            S.lightOp = lightOp;
            els.light.style.opacity = lightOp.toFixed(3);
            els.viewport.style.opacity = (1 - smooth(TOTAL + 0.35, TOTAL + 1.05, p)).toFixed(3);
            var chrome = (1 - lightOp).toFixed(3);
            els.realm.style.opacity = c < 0.5 ? '0' : chrome;
            els.rope.style.opacity = c < 0.5 ? '0' : chrome;
            var zone = lightOp > 0.6 ? 'finale' : 'stair';
            if (zone !== body.dataset.zone) body.dataset.zone = zone;
        }
        var realmOp = c < 0.5 ? '0' : (1 - lightOp).toFixed(3);
        if (realmOp !== S.realmOp) { S.realmOp = realmOp; els.realm.style.opacity = realmOp; els.rope.style.opacity = realmOp; }
        focusLogic(c, p, now);
    }

    function updatePlates(c) {
        for (var i = 0; i < PLATES.length; i++) {
            var pl = PLATES[i];
            var fadeIn = i === 0 ? 1 : smooth(pl.at - 1.2, pl.at + 0.2, c);
            var fadeOut = i === PLATES.length - 1 ? 1 : 1 - smooth(pl.until - 0.2, pl.until + 1.2, c);
            var op = Math.min(fadeIn, fadeOut);
            var img = plates[i];
            if (op > 0 && !img.dataset.loaded) {
                img.dataset.loaded = '1';
                img.srcset = img.dataset.srcset;
            }
            if (img._op !== op) {
                img._op = op;
                img.style.opacity = op.toFixed(3);
            }
            if (op > 0 && !reduced) {
                var local = (c - pl.at) / Math.max(1, pl.until - pl.at);
                img.style.transform = 'translate3d(0,' + (local * 2.5).toFixed(2) + '%,0) scale(1.04)';
            }
        }
        var step = Math.max(1, Math.round(c));
        var realm = step <= 8 ? 'abyss' : step <= 20 ? 'earth' : step <= 28 ? 'dawn' : 'heaven';
        if (c < 0.5) realm = 'abyss';
        if (realm !== S.realm) { S.realm = realm; body.dataset.realm = realm; }
        var r = REALMS[0];
        for (var k = 0; k < REALMS.length; k++) { if (step <= REALMS[k].upTo) { r = REALMS[k]; break; } }
        var label = r.el + ' · ' + r.en;
        if (label !== S.realmLabel) {
            S.realmLabel = label;
            while (els.realm.firstChild) els.realm.removeChild(els.realm.firstChild);
            var gr = el('span', null, r.el);
            gr.lang = 'el';
            els.realm.appendChild(gr);
            els.realm.appendChild(doc.createTextNode(' · ' + r.en));
        }
    }

    function updateRope(c) {
        var cur = Math.round(c);
        for (var i = 0; i < S.steps.length; i++) {
            var s = S.steps[i];
            var on = s.n <= cur;
            if (on !== s.ropeOn) { s.ropeOn = on; s.knot.classList.toggle('on', on); }
            var isCur = s.n === cur;
            if (isCur !== s.ropeCur) { s.ropeCur = isCur; s.knot.classList.toggle('cur', isCur); }
        }
    }

    /* ---------------------------------------------------------------- focus + music */

    function focusLogic(c, p, now) {
        var nearest = Math.round(c);
        var cand = (Math.abs(c - nearest) < 0.28 && nearest >= 1 && nearest <= TOTAL && p < TOTAL + 0.35) ? nearest : 0;
        if (cand !== S.cand) { S.cand = cand; S.candSince = now; }
        if (cand && cand !== S.focused && now - S.candSince >= FOCUS_MS) setFocused(cand, false);
        if (!cand && S.focused && now - S.candSince >= 250) setFocused(0, false);
    }

    function setFocused(n, fromUser) {
        if (S.focused === n) return;
        if (S.focused && S.byN[S.focused]) S.byN[S.focused].el.classList.remove('is-focused');
        S.focused = n;
        if (!n) return;
        var s = S.byN[n];
        s.el.classList.add('is-focused');
        var d = s.data;
        els.dockNum.textContent = d.numeral;
        els.dockTitle.textContent = d.el;
        els.dockLat.textContent = d.lat;
        if (d.spotify) {
            els.dockYt.hidden = true;
        } else if (d.youtube) {
            els.dockYt.href = ytUrl(d.youtube);
            els.dockYt.hidden = false;
        } else {
            els.dockYt.hidden = true;
        }
        if (!S.muted || fromUser) play(n, fromUser);
    }

    function play(n, force) {
        var s = S.byN[n];
        if (!s || !S.opened) return;
        if (S.muted && !force) return;
        var d = s.data;
        if (!d.spotify) {
            pauseSong();
            return;
        }
        var uri = 'spotify:track:' + d.spotify;
        S.wantUri = uri;
        if (!S.controller) { ensureApi(); return; }
        if (S.currentUri !== uri) {
            S.controller.loadUri(uri);
            S.currentUri = uri;
        }
        S.controller.play();
        // If the embed was still loading the new track, ask once more.
        clearTimeout(S.retryTimer);
        S.retryTimer = setTimeout(function () {
            if (S.controller && S.paused && S.wantUri === uri && (!S.muted || force)) S.controller.play();
        }, 900);
        // Spotify often refuses to start a track the page asks for (logged-out listeners
        // above all). If it is still paused, ask the listener to press play in the player.
        clearTimeout(S.tapTimer);
        S.tapTimer = setTimeout(function () {
            if (S.paused && S.wantUri === uri) needsTap(true);
        }, 2200);
    }

    var dockEl = doc.getElementById('dock');
    var dockNote = dockEl ? dockEl.querySelector('.dock-note') : null;
    var NOTE_DEFAULT = dockNote ? dockNote.textContent : '';
    function needsTap(on) {
        if (!dockEl || !dockNote) return;
        dockEl.classList.toggle('needs-tap', on);
        dockNote.textContent = on ? 'Press \u25B6 in the player to hear this song.' : NOTE_DEFAULT;
    }

    // Pausing an embed with nothing playing throws inside Spotify's frame.
    function pauseSong() { if (S.controller && !S.paused) S.controller.pause(); }

    function ensureApi() {
        if (S.apiRequested) return;
        S.apiRequested = true;
        window.onSpotifyIframeApiReady = function (IFrameAPI) {
            var first = S.wantUri || ('spotify:track:' + (S.steps[0].data.spotify || ''));
            IFrameAPI.createController(els.embed, { uri: first, width: '100%', height: 80 }, function (ctrl) {
                S.controller = ctrl;
                S.currentUri = first;
                ctrl.addListener('playback_update', function (e) {
                    if (e && e.data) {
                        S.paused = !!e.data.isPaused;
                        if (!S.paused) needsTap(false);
                    }
                });
                ctrl.addListener('ready', function () {
                    if (S.wantUri && !S.muted) play(S.focused || 1, false);
                });
            });
        };
        var sc = doc.createElement('script');
        sc.src = 'https://open.spotify.com/embed/iframe-api/v1';
        sc.async = true;
        doc.head.appendChild(sc);
    }

    function setMuteUi() {
        els.mute.setAttribute('aria-pressed', S.muted ? 'true' : 'false');
        els.mute.querySelector('.lbl').textContent = S.muted ? 'Muted' : 'Mute';
        els.mute.title = S.muted ? 'Songs will not start on their own. Press to let them play.' : 'Stop songs starting on their own';
    }
    els.mute.addEventListener('click', function () {
        S.muted = !S.muted;
        saveMuted();
        setMuteUi();
        if (S.muted) {
            pauseSong();
        } else if (S.focused) {
            play(S.focused, true);
        }
    });

    /* ---------------------------------------------------------------- navigation */

    function goTo(k, instant) {
        var top = k > TOTAL ? els.finale.offsetTop : scrollFor(clamp(k, 0, TOTAL));
        window.scrollTo({ top: top, behavior: (reduced || instant) ? 'auto' : 'smooth' });
    }

    function jumpTo(n) {
        if (!S.opened) { openDoor(); pendingJump = n; return; }
        goTo(n, true);
        setTimeout(function () {
            var s = S.byN[n];
            var btn = s && s.el.querySelector('.play, .yt');
            if (btn) btn.focus({ preventScroll: true });
        }, 60);
    }
    var pendingJump = 0;

    function isTyping(t) {
        if (!t || t === body) return false;
        var tag = t.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
    }

    window.addEventListener('keydown', function (ev) {
        if (!S.opened || ev.altKey || ev.ctrlKey || ev.metaKey || isTyping(ev.target)) return;
        var inStair = S.p < TOTAL + 0.6;
        var cur = Math.round(S.c);
        var key = ev.key;
        if (key === 'Enter') {
            var tag = ev.target && ev.target.tagName;
            if (tag === 'BUTTON' || tag === 'A') return;
            if (inStair && cur >= 1) { ev.preventDefault(); setFocused(cur, true); play(cur, true); }
            return;
        }
        if (!inStair) {
            if ((key === 'ArrowUp' || key === 'PageUp') && window.scrollY <= els.finale.offsetTop + 4) {
                ev.preventDefault(); goTo(TOTAL);
            }
            return;
        }
        if (key === 'ArrowDown' || key === 'ArrowRight' || key === 'PageDown') {
            ev.preventDefault();
            goTo(cur >= TOTAL ? TOTAL + 1 : cur + 1);
        } else if (key === 'ArrowUp' || key === 'ArrowLeft' || key === 'PageUp') {
            ev.preventDefault();
            goTo(Math.max(0, cur - 1));
        } else if (key === 'Home') {
            ev.preventDefault(); goTo(0);
        }
    });

    // Run fn once the page has arrived at top (smooth scrolls take a moment);
    // give up quietly if the reader scrolls somewhere else instead.
    function whenAt(top, fn) {
        var t0 = Date.now();
        (function check() {
            if (Math.abs(window.scrollY - top) < 2) { fn(); return; }
            if (Date.now() - t0 < 4000) setTimeout(check, 100);
        })();
    }

    els.again.addEventListener('click', function () {
        goTo(1, reduced);
        // Keyboard focus follows the reader back to the first step.
        whenAt(scrollFor(1), function () {
            var btn = S.byN[1] && S.byN[1].el.querySelector('.play, .yt');
            if (btn) btn.focus({ preventScroll: true });
        });
    });

    var skip = doc.querySelector('.skip');
    skip.addEventListener('click', function (ev) {
        ev.preventDefault();
        var go = function () {
            window.scrollTo(0, els.finale.offsetTop + els.finale.querySelector('.finale-hero').offsetHeight);
            var first = els.indexList.querySelector('a');
            if (first) first.focus({ preventScroll: true });
        };
        if (!S.opened) { openDoor(true); setTimeout(go, 50); } else go();
    });

    /* ---------------------------------------------------------------- the door */

    function openDoor(quick) {
        if (S.opened || S.opening || !S.geo) return;
        S.opening = true;
        els.open.disabled = true;
        ensureApi();                      // the click is the audio unlock gesture
        els.door.classList.add('is-open');
        els.dock.hidden = false;
        layout();
        window.scrollTo(0, 0);
        var delay = (reduced || quick === true) ? 50 : 1700;
        setTimeout(function () {
            root.classList.remove('locked');
            S.opened = true;
            S.opening = false;
            S.dirty = true;
            layout();
            startMotes();
            if (pendingJump) { var n = pendingJump; pendingJump = 0; jumpTo(n); }
            else if (quick !== true) {
                var m = /^#step-(\d{1,2})$/.exec(location.hash);
                var target = m ? parseInt(m[1], 10) : 0;
                if (target >= 1 && target <= TOTAL) jumpTo(target);
                else els.threshold.focus({ preventScroll: true });
            }
        }, delay);
        setTimeout(function () {
            els.door.classList.add('is-gone');
            stopCandle();
        }, (reduced || quick === true) ? 800 : 3400);
    }

    /* ---------------------------------------------------------------- main loop */

    var hidden = doc.hidden;
    doc.addEventListener('visibilitychange', function () {
        hidden = doc.hidden;
        if (!hidden) { S.dirty = true; kick(); }
    });

    var rafId = 0;
    function frame(now) {
        rafId = 0;
        if (hidden) return;
        if (S.opened || S.opening) render(now);
        tickMotes(now);
        tickCandle(now);
        kick();
    }
    function kick() { if (!rafId && !hidden) rafId = window.requestAnimationFrame(frame); }
    kick();

    /* ---------------------------------------------------------------- candle glow (door) */

    var CANDLES = [
        [240, 385, 1.0], [199, 407, .55], [216, 407, .55], [262, 412, .5], [284, 394, .6],
        [1162, 372, 1.0], [1130, 404, .55], [1143, 410, .5], [1196, 384, .6]
    ];
    var cv = els.candle, cctx = cv && cv.getContext('2d');
    var candleOn = false;
    function sizeCandle() {
        if (!cv) return;
        var r = cv.getBoundingClientRect();
        var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        cv.width = Math.max(1, Math.round(r.width * dpr));
        cv.height = Math.max(1, Math.round(r.height * dpr));
    }
    function drawCandle(t) {
        var w = cv.width, h = cv.height, sx = w / 1376, sy = h / 768;
        cctx.clearRect(0, 0, w, h);
        for (var i = 0; i < CANDLES.length; i++) {
            var c = CANDLES[i];
            var f = reduced ? 0.85 : 0.72 + 0.16 * Math.sin(t / 97 + i * 1.7) + 0.08 * Math.sin(t / 41 + i * 3.1) + 0.06 * (Math.random() - 0.5);
            var rad = 150 * c[2] * f * sx;
            var g = cctx.createRadialGradient(c[0] * sx, c[1] * sy, 0, c[0] * sx, c[1] * sy, rad);
            g.addColorStop(0, 'rgba(255,196,110,' + (0.42 * f) + ')');
            g.addColorStop(0.35, 'rgba(230,120,40,' + (0.16 * f) + ')');
            g.addColorStop(1, 'rgba(120,40,10,0)');
            cctx.fillStyle = g;
            cctx.fillRect(c[0] * sx - rad, c[1] * sy - rad, rad * 2, rad * 2);
        }
        // A breath of warm light on the doors themselves.
        var fd = reduced ? 0.8 : 0.75 + 0.1 * Math.sin(t / 180) + 0.05 * Math.sin(t / 53);
        var gd = cctx.createRadialGradient(688 * sx, 400 * sy, 0, 688 * sx, 400 * sy, 420 * sx);
        gd.addColorStop(0, 'rgba(255,190,100,' + (0.13 * fd) + ')');
        gd.addColorStop(1, 'rgba(255,190,100,0)');
        cctx.fillStyle = gd;
        cctx.fillRect(0, 0, w, h);
    }
    function startCandle() {
        if (!cctx) return;
        sizeCandle();
        candleOn = true;
        drawCandle(performance.now());
    }
    function stopCandle() { candleOn = false; }
    var lastCandle = 0;
    function tickCandle(now) {
        if (!candleOn || reduced) return;
        if (now - lastCandle < 50) return;   // about 20 fps is plenty for a flame
        lastCandle = now;
        drawCandle(now);
    }

    /* ---------------------------------------------------------------- particles (ascent) */

    var mv = els.motes, mctx = mv && mv.getContext('2d');
    var parts = [];
    var motesOn = false, mW = 0, mH = 0, mDpr = 1, lastM = 0;
    function sizeMotes() {
        if (!mv) return;
        mDpr = Math.min(window.devicePixelRatio || 1, 1.5);
        mW = window.innerWidth; mH = window.innerHeight;
        mv.width = Math.round(mW * mDpr); mv.height = Math.round(mH * mDpr);
        mctx.setTransform(mDpr, 0, 0, mDpr, 0, 0);
    }
    function weights(a) {
        return {
            ember: 1 - smooth(0.12, 0.34, a),
            dust: smooth(0.12, 0.3, a) * (1 - smooth(0.6, 0.8, a)),
            mote: smooth(0.55, 0.85, a),
            feather: smooth(0.7, 0.95, a) * 0.25
        };
    }
    function spawn(p, initial) {
        var w = weights(S.c / TOTAL);
        var sum = w.ember + w.dust + w.mote + w.feather;
        var r = Math.random() * sum;
        var type = r < w.ember ? 'ember' : r < w.ember + w.dust ? 'dust' : r < w.ember + w.dust + w.mote ? 'mote' : 'feather';
        p.type = type;
        p.x = Math.random() * mW;
        p.life = 0;
        p.seed = Math.random() * 1000;
        if (type === 'ember') {
            p.y = initial ? Math.random() * mH : mH + 10;
            p.vx = (Math.random() - 0.5) * 12; p.vy = -(18 + Math.random() * 40);
            p.r = 0.8 + Math.random() * 1.8;
        } else if (type === 'dust') {
            p.y = Math.random() * mH;
            p.vx = (Math.random() - 0.5) * 6; p.vy = (Math.random() - 0.5) * 6;
            p.r = 0.5 + Math.random() * 1.1;
        } else if (type === 'mote') {
            p.y = initial ? Math.random() * mH : mH + 10;
            p.vx = (Math.random() - 0.5) * 8; p.vy = -(6 + Math.random() * 14);
            p.r = 1.5 + Math.random() * 3.5;
        } else {
            p.y = initial ? Math.random() * mH : -20;
            p.vx = (Math.random() - 0.5) * 10; p.vy = 10 + Math.random() * 12;
            p.r = 6 + Math.random() * 6;
            p.rot = Math.random() * Math.PI;
        }
        p.max = 6 + Math.random() * 8;
        return p;
    }
    function startMotes() {
        if (!mctx || reduced) return;
        sizeMotes();
        var count = mW < 760 ? 46 : 96;
        parts = [];
        for (var i = 0; i < count; i++) parts.push(spawn({}, true));
        motesOn = true;
        lastM = performance.now();
    }
    function drawFeather(p) {
        mctx.save();
        mctx.translate(p.x, p.y);
        mctx.rotate(p.rot + Math.sin((p.life + p.seed) * 1.3) * 0.6);
        mctx.fillStyle = 'rgba(255,250,238,0.55)';
        mctx.beginPath();
        mctx.ellipse(0, 0, p.r * 0.32, p.r, 0, 0, Math.PI * 2);
        mctx.fill();
        mctx.strokeStyle = 'rgba(210,180,120,0.6)';
        mctx.lineWidth = 0.6;
        mctx.beginPath(); mctx.moveTo(0, -p.r); mctx.lineTo(0, p.r * 1.3); mctx.stroke();
        mctx.restore();
    }
    function tickMotes(now) {
        if (!motesOn) return;
        var dt = Math.min(0.05, (now - lastM) / 1000);
        lastM = now;
        mctx.clearRect(0, 0, mW, mH);
        var fade = 1 - (S.lightOp || 0);
        if (fade <= 0.01) return;
        var lampX = mW * 0.55, lampY = mH * 0.4, lampR = Math.max(mW, mH) * 0.45;
        for (var i = 0; i < parts.length; i++) {
            var p = parts[i];
            p.life += dt;
            var sway = Math.sin((p.life + p.seed) * 1.7);
            p.x += (p.vx + sway * (p.type === 'feather' ? 14 : 4)) * dt;
            p.y += p.vy * dt;
            var a = clamp(Math.min(p.life / 1.2, (p.max - p.life) / 1.5), 0, 1) * fade;
            if (p.life > p.max || p.y < -30 || p.y > mH + 30 || p.x < -30 || p.x > mW + 30) { spawn(p, false); continue; }
            if (p.type === 'ember') {
                var fl = 0.6 + 0.4 * Math.sin((p.life + p.seed) * 9);
                mctx.globalCompositeOperation = 'lighter';
                mctx.fillStyle = 'rgba(255,150,60,' + (0.75 * a * fl) + ')';
                mctx.beginPath(); mctx.arc(p.x, p.y, p.r, 0, 6.283); mctx.fill();
                mctx.fillStyle = 'rgba(255,90,20,' + (0.14 * a * fl) + ')';
                mctx.beginPath(); mctx.arc(p.x, p.y, p.r * 4, 0, 6.283); mctx.fill();
            } else if (p.type === 'dust') {
                var dx = p.x - lampX, dy = p.y - lampY;
                var lit = clamp(1 - Math.sqrt(dx * dx + dy * dy) / lampR, 0.08, 1);
                mctx.globalCompositeOperation = 'lighter';
                mctx.fillStyle = 'rgba(240,200,130,' + (0.7 * a * lit) + ')';
                mctx.beginPath(); mctx.arc(p.x, p.y, p.r, 0, 6.283); mctx.fill();
            } else if (p.type === 'mote') {
                mctx.globalCompositeOperation = 'lighter';
                var g = mctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3);
                g.addColorStop(0, 'rgba(255,248,225,' + (0.6 * a) + ')');
                g.addColorStop(1, 'rgba(255,230,170,0)');
                mctx.fillStyle = g;
                mctx.beginPath(); mctx.arc(p.x, p.y, p.r * 3, 0, 6.283); mctx.fill();
            } else {
                mctx.globalCompositeOperation = 'source-over';
                mctx.globalAlpha = a;
                drawFeather(p);
                mctx.globalAlpha = 1;
            }
        }
        mctx.globalCompositeOperation = 'source-over';
    }
})();
