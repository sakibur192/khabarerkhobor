/* Khabarer Khobor — site script (vanilla JS, no libraries) */
(function () {
  'use strict';
  var K = window.KK || { tx: {} };
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var ls = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  // ---------------- analytics ----------------
  var vid = ls.get('kk_vid', '');
  if (!vid) { vid = Math.random().toString(36).slice(2) + Date.now().toString(36); ls.set('kk_vid', vid); }
  function ev(type, data) {
    if (!K.track) return;
    var b = { t: type, p: location.pathname + location.search, u: vid };
    for (var k in data) b[k] = data[k];
    var body = JSON.stringify(b);
    if (navigator.sendBeacon) navigator.sendBeacon('/api/ev', body);
    else fetch('/api/ev', { method: 'POST', body: body, keepalive: true });
  }
  ev('pageview', { r: document.referrer });
  function trackPlay(v) {
    ev('play', { v: v.id });
    try { if (K.ga && window.gtag) gtag('event', 'video_play', { video_id: v.y, video_title: v.t }); } catch (e) {}
    try { if (K.px && window.fbq) fbq('track', 'ViewContent', { content_name: v.t, content_ids: [String(v.id)], content_type: 'video' }); } catch (e) {}
  }

  function toast(msg) {
    var t = $('#toast'); if (!t) return;
    t.textContent = msg; t.classList.add('on');
    clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('on'); }, 2200);
  }

  // ---------------- YouTube embed ----------------
  function embed(id, o) {
    o = o || {};
    var p = 'autoplay=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1' + (o.mute ? '&mute=1' : '') + (o.ctl === false ? '&controls=0&disablekb=1&loop=1&playlist=' + id : '');
    var f = document.createElement('iframe');
    f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?' + p;
    f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    f.allowFullscreen = true; f.title = o.title || 'YouTube video';
    f.setAttribute('loading', 'eager');
    return f;
  }
  function ytCmd(frame, fn) {
    try { frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func: fn, args: [] }), '*'); } catch (e) {}
  }
  function ytLink(v) { return v.k === 's' ? 'https://www.youtube.com/shorts/' + v.y : 'https://www.youtube.com/watch?v=' + v.y; }
  function parseV(el) { try { return JSON.parse(el.getAttribute('data-v')); } catch (e) { return null; } }

  // ---------------- main (hero) player + mini player ----------------
  var hero = $('#heroV'), heroOn = false, heroIO = null, heroCounted = false;
  function heroCount(v) { if (!heroCounted) { heroCounted = true; trackPlay(v); } }
  function heroStop() {
    if (!hero || !heroOn) return;
    var f = $('iframe', hero), u = $('.unmute', hero);
    if (f) f.remove(); if (u) u.remove();
    hero.classList.remove('mini'); heroOn = false; heroCounted = false;
  }
  function heroStart(muted, user) {
    if (!hero) return;
    var v = parseV(hero); if (!v) return;
    if (user && v.m === 'youtube') { heroCount(v); window.open(ytLink(v), '_blank', 'noopener'); return; }
    if (user && v.m === 'page' && location.pathname !== v.u) { location.href = v.u + '?play=1'; return; }
    closePopup();
    var box = $('.hero-in', hero), old = $('iframe', box);
    if (old) { if (!muted) { ytCmd(old, 'unMute'); ytCmd(old, 'playVideo'); var um = $('.unmute', hero); if (um) um.remove(); heroCount(v); } return; }
    var f = embed(v.y, { mute: muted, title: v.t });
    box.appendChild(f); heroOn = true;
    if (muted) {
      var b = document.createElement('button');
      b.className = 'unmute'; b.innerHTML = '<svg class="ic"><use href="#i-mute"/></svg>' + (K.tx.unmute || 'Unmute');
      b.onclick = function (e) { e.stopPropagation(); ytCmd(f, 'unMute'); ytCmd(f, 'playVideo'); b.remove(); heroCount(v); };
      box.appendChild(b);
    } else heroCount(v);
    if (K.mini && 'IntersectionObserver' in window && !heroIO) {
      heroIO = new IntersectionObserver(function (es) {
        if (!heroOn) return;
        hero.classList.toggle('mini', !es[0].isIntersecting && es[0].boundingClientRect.top < 0);
      }, { threshold: 0.15 });
      heroIO.observe(hero);
    }
  }
  if (hero) {
    hero.addEventListener('click', function (e) {
      if (e.target.closest('.mini-x')) { e.preventDefault(); heroStop(); return; }
      if (e.target.closest('.unmute')) return;
      if (!heroOn) heroStart(false, true);
    });
    $$('[data-play]').forEach(function (b) { b.addEventListener('click', function () { hero.scrollIntoView({ behavior: 'smooth', block: 'center' }); heroStart(false, true); }); });
    var fromClick = /[?&]play=1/.test(location.search);
    if (hero.getAttribute('data-auto') === '1' || fromClick) {
      var go = function () { heroStart(true, false); if (fromClick) { var v = parseV(hero); if (v) heroCount(v); } };
      if (document.readyState === 'complete') setTimeout(go, 250); else window.addEventListener('load', function () { setTimeout(go, 250); });
    }
  }

  // ---------------- popup player (inline mode) ----------------
  var pop = $('#kkp'), queue = [], qi = 0;
  function openPopup(v, list) {
    if (!pop) { location.href = v.u; return; }
    heroStop(); stopPreview();
    queue = list && list.length ? list : [v];
    qi = Math.max(0, queue.findIndex(function (x) { return x.id === v.id; }));
    loadPopup(false);
  }
  function loadPopup(keepMini) {
    var v = queue[qi]; if (!v) return;
    var fr = $('.kkp-frame', pop); fr.innerHTML = ''; fr.appendChild(embed(v.y, { title: v.t }));
    $('.kkp-t', pop).textContent = v.t;
    $('[data-x=yt]', pop).href = ytLink(v);
    $('[data-x=page]', pop).href = v.u;
    $('[data-x=prev]', pop).hidden = qi <= 0;
    $('[data-x=next]', pop).hidden = qi >= queue.length - 1;
    pop.classList.toggle('short', v.k === 's');
    if (!keepMini) pop.classList.remove('mini');
    pop.hidden = false;
    document.documentElement.style.overflow = pop.classList.contains('mini') ? '' : 'hidden';
    trackPlay(v);
  }
  function closePopup() {
    if (!pop || pop.hidden) return;
    pop.hidden = true; $('.kkp-frame', pop).innerHTML = ''; pop.classList.remove('mini');
    document.documentElement.style.overflow = '';
  }
  if (pop) {
    pop.addEventListener('click', function (e) {
      var b = e.target.closest('[data-x]'); if (!b) return;
      var x = b.getAttribute('data-x');
      if (x === 'close') { e.preventDefault(); if (!pop.classList.contains('mini') || b.tagName === 'BUTTON') closePopup(); }
      else if (x === 'min') { if (K.mini) { pop.classList.add('mini'); document.documentElement.style.overflow = ''; } else closePopup(); }
      else if (x === 'max') { pop.classList.remove('mini'); document.documentElement.style.overflow = 'hidden'; }
      else if (x === 'prev' && qi > 0) { qi--; loadPopup(true); }
      else if (x === 'next' && qi < queue.length - 1) { qi++; loadPopup(true); }
    });
    document.addEventListener('keydown', function (e) {
      if (pop.hidden) return;
      if (e.key === 'Escape') { if (K.mini && !pop.classList.contains('mini')) { pop.classList.add('mini'); document.documentElement.style.overflow = ''; } else closePopup(); }
      if (e.key === 'ArrowRight' && qi < queue.length - 1) { qi++; loadPopup(true); }
      if (e.key === 'ArrowLeft' && qi > 0) { qi--; loadPopup(true); }
    });
  }

  // card clicks follow the play mode chosen in admin
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[data-v]');
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;
    var v = parseV(a); if (!v) return;
    if (v.m === 'youtube') { e.preventDefault(); trackPlay(v); window.open(ytLink(v), '_blank', 'noopener'); return; }
    if (v.m === 'inline') {
      e.preventDefault();
      var scope = a.closest('.grid,.shelf,.rel,section') || document;
      var list = $$('a[data-v]', scope).map(parseV).filter(function (x) { return x && x.m === 'inline'; });
      openPopup(v, list);
      return;
    }
    // page mode → open the video page and start playing
    if (v.m === 'page' && a.getAttribute('href').indexOf('play=1') < 0) { e.preventDefault(); location.href = v.u + '?play=1'; }
  });

  // ---------------- hover preview (desktop) ----------------
  var pvTimer = null, pvEl = null;
  function stopPreview() { clearTimeout(pvTimer); if (pvEl) { var f = $('iframe.pv', pvEl); if (f) f.remove(); pvEl = null; } }
  if (K.hover && window.matchMedia && matchMedia('(hover:hover) and (pointer:fine)').matches) {
    document.addEventListener('mouseover', function (e) {
      var a = e.target.closest('a[data-v]');
      if (!a || a === pvEl || (pop && !pop.hidden && !pop.classList.contains('mini'))) return;
      var box = $('.thumb', a) || (a.classList.contains('short') ? a : null);
      if (!box) return;
      stopPreview(); pvEl = a;
      pvTimer = setTimeout(function () {
        var v = parseV(a); if (!v || pvEl !== a) return;
        var f = embed(v.y, { mute: true, ctl: false, title: v.t }); f.className = 'pv';
        f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;z-index:3;pointer-events:none';
        box.appendChild(f);
      }, 800);
    });
    document.addEventListener('mouseout', function (e) {
      if (!pvEl) return;
      var to = e.relatedTarget;
      if (!to || !pvEl.contains(to)) stopPreview();
    });
  }

  // ---------------- save (watch later, stored in the browser) ----------------
  var saved = ls.get('kk_saved', []);
  function paintSave(b) {
    var on = saved.indexOf(+b.getAttribute('data-save')) > -1;
    b.classList.toggle('on', on);
    var u = $('use', b); if (u) u.setAttribute('href', on ? '#i-bookmarked' : '#i-bookmark');
    var s = $('span', b); if (s) s.textContent = on ? K.tx.saved : K.tx.save;
  }
  $$('[data-save]').forEach(function (b) {
    paintSave(b);
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      var id = +b.getAttribute('data-save'), i = saved.indexOf(id);
      if (i > -1) saved.splice(i, 1); else { saved.unshift(id); toast(K.tx.saved); }
      ls.set('kk_saved', saved.slice(0, 100)); paintSave(b);
    });
  });
  var sl = $('#savedList');
  if (sl) {
    if (!saved.length) $('#savedEmpty').hidden = false;
    else fetch('/api/videos?ids=' + saved.join(',')).then(function (r) { return r.json(); }).then(function (j) {
      sl.innerHTML = j.html; if (!j.html) $('#savedEmpty').hidden = false;
    });
  }

  // ---------------- share ----------------
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-share]'); if (!b) return;
    e.stopPropagation();
    var url = b.getAttribute('data-share'), title = b.getAttribute('data-title') || document.title;
    ev('share', {});
    if (navigator.share) navigator.share({ title: title, url: url }).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast(K.tx.copied); });
  });

  // ---------------- misc UI ----------------
  $$('.shelf-w').forEach(function (w) {
    var s = $('.shelf', w);
    $$('.shelf-b', w).forEach(function (b) {
      b.addEventListener('click', function () { s.scrollBy({ left: (b.classList.contains('l') ? -1 : 1) * s.clientWidth * 0.8, behavior: 'smooth' }); });
    });
  });
  var ms = $('#mSearch');
  if (ms) ms.addEventListener('click', function () { var f = $('.hsearch'); f.classList.toggle('open'); if (f.classList.contains('open')) $('input', f).focus(); });

  // newsletter
  var nl = $('#nlForm');
  if (nl) nl.addEventListener('submit', function (e) {
    e.preventDefault();
    var m = $('.nl-msg', nl), email = nl.email.value.trim();
    fetch('/api/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email }) })
      .then(function (r) {
        m.textContent = r.ok ? m.getAttribute('data-ok') : m.getAttribute('data-bad');
        m.style.color = r.ok ? '#1b7a3a' : '#ba1a1a';
        if (r.ok) { nl.reset(); try { if (K.px && window.fbq) fbq('track', 'Lead'); if (K.ga && window.gtag) gtag('event', 'sign_up', { method: 'newsletter' }); } catch (x) {} }
      });
  });
  // contact
  var cf = $('#cForm');
  if (cf) cf.addEventListener('submit', function (e) {
    e.preventDefault();
    var d = {}; new FormData(cf).forEach(function (v, k) { d[k] = v; });
    fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) })
      .then(function (r) { if (r.ok) { cf.reset(); $('.cmsg', cf).textContent = $('.cmsg', cf).getAttribute('data-ok'); try { if (K.px && window.fbq) fbq('track', 'Contact'); } catch (x) {} } });
  });

  // ad impressions (counted once each, when actually visible)
  if ('IntersectionObserver' in window) {
    var aio = new IntersectionObserver(function (es) {
      es.forEach(function (x) { if (x.isIntersecting) { ev('ad_view', { a: +x.target.getAttribute('data-ad') }); aio.unobserve(x.target); } });
    }, { threshold: 0.5 });
    $$('[data-ad]').forEach(function (a) { if (a.offsetParent !== null) aio.observe(a); });
  }
})();
