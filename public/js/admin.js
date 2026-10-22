/* Admin panel helpers */
(function () {
  'use strict';
  var $ = function (s, c) { return (c || document).querySelector(s); };

  function post(url) {
    var f = document.createElement('form'); f.method = 'post'; f.action = url;
    var i = document.createElement('input'); i.type = 'hidden'; i.name = '_csrf'; i.value = window.CSRF; f.appendChild(i);
    document.body.appendChild(f); f.submit();
  }
  document.addEventListener('click', function (e) {
    var d = e.target.closest('[data-del]');
    if (d) { e.preventDefault(); if (confirm('Delete this permanently?')) post(d.getAttribute('data-del')); return; }
    var t = e.target.closest('[data-toggle]');
    if (t) {
      e.preventDefault();
      fetch(t.getAttribute('data-toggle'), { method: 'POST', headers: { 'x-csrf': window.CSRF } }).then(function (r) { return r.json(); }).then(function (j) {
        if (!j.ok) return;
        t.classList.toggle('on', j.on);
        var p = t.querySelector('path');
        p.setAttribute('d', j.on ? 'M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z'
          : 'M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z');
      });
    }
  });

  // image field preview
  document.querySelectorAll('.img-f input[type=file]').forEach(function (inp) {
    inp.addEventListener('change', function () {
      var f = inp.files[0]; if (!f) return;
      var box = inp.closest('.img-f'), img = box.querySelector('img');
      if (!img) { img = document.createElement('img'); var n = box.querySelector('.noimg'); if (n) n.replaceWith(img); }
      img.src = URL.createObjectURL(f);
    });
  });

  // video form: YouTube link → preview + fetch info
  var vf = $('#vform');
  if (vf) {
    var url = vf.elements.yt_url, msg = $('#ytMsg'), prev = $('#ytPrev');
    var idOf = function (s) {
      s = (s || '').trim();
      if (/^[\w-]{11}$/.test(s)) return { id: s };
      var m = s.match(/youtube\.com\/shorts\/([\w-]{11})/i); if (m) return { id: m[1], short: true };
      m = s.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|live\/))([\w-]{11})/i);
      return m ? { id: m[1] } : null;
    };
    var showPrev = function () {
      var y = idOf(url.value);
      prev.innerHTML = y ? '<img src="https://i.ytimg.com/vi/' + y.id + '/hqdefault.jpg" alt="">' : '<span>Preview</span>';
      if (y && y.short) vf.elements.kind.value = 'short';
      return y;
    };
    url.addEventListener('input', showPrev);
    var fetchInfo = function (auto) {
      var y = showPrev();
      if (!y) { msg.textContent = 'Not a valid YouTube link.'; msg.className = 'err'; return; }
      msg.textContent = 'Fetching…'; msg.className = 'muted';
      fetch(window.ADMIN + '/api/yt?url=' + encodeURIComponent(url.value)).then(function (r) { return r.json(); }).then(function (j) {
        if (!j.ok) { msg.textContent = j.error; msg.className = 'err'; return; }
        var el = vf.elements, filled = [];
        if (j.title && !el.title_en.value) { el.title_en.value = j.title; filled.push('title'); }
        if (j.title && !el.title_bn.value) el.title_bn.value = j.title;
        if (j.duration && !el.duration.value) { el.duration.value = j.duration; filled.push('duration'); }
        if (j.views && (!el.yt_views.value || el.yt_views.value === '0')) { el.yt_views.value = j.views; filled.push('views'); }
        if (j.description && !el.desc_en.value) el.desc_en.value = j.description;
        var t = (filled.length ? 'Filled: ' + filled.join(', ') + '.' : 'Nothing new to fill.') + (j.author ? ' Channel: ' + j.author + '.' : '');
        if (!j.hasKey) t += ' (Add a YouTube API key in Settings → Video Player to also get duration & views.)';
        if (j.exists && String(j.exists) !== vf.elements.id.value) t += ' ⚠ This video is already on the site (#' + j.exists + ').';
        msg.textContent = t; msg.className = j.exists ? 'warn' : 'ok';
      }).catch(function () { msg.textContent = 'Could not reach YouTube. Fill the fields by hand.'; msg.className = 'err'; });
    };
    $('#ytFetch').addEventListener('click', function () { fetchInfo(false); });
    if (url.value && !vf.elements.id.value) fetchInfo(true);
  }

  // settings tabs highlight
  var tabs = document.querySelectorAll('.tabs.sticky a');
  if (tabs.length && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (x) { if (x.isIntersecting) tabs.forEach(function (a) { a.classList.toggle('on', a.getAttribute('href') === '#' + x.target.id); }); });
    }, { rootMargin: '-30% 0px -60% 0px' });
    document.querySelectorAll('.settings section').forEach(function (s) { io.observe(s); });
  }
  // auto-hide flash
  var fl = $('.flash.ok'); if (fl) setTimeout(function () { fl.style.opacity = '0'; setTimeout(function () { fl.remove(); }, 400); }, 4000);
})();
