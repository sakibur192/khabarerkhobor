// Public website: pages, templates, tracking API.
const express = require('express');
const crypto = require('crypto');
const db = require('./db');
const config = require('./config');
const L = require('./lib');
const { sprite, icon } = require('./icons');
const { esc, t, f, S, num, compact, timeAgo, fullDate, thumbOf, ytThumb, cache } = L;

const ASSET_V = Date.now().toString(36); // cache-busting for css/js

// ======================================================================
//  DATA HELPERS
// ======================================================================
const PUB = `v.status='published' AND v.published_at<=NOW()`;
const VCOLS = `v.*, c.slug AS cat_slug, c.name_bn AS cat_bn, c.name_en AS cat_en`;
const VFROM = `FROM videos v LEFT JOIN categories c ON c.id=v.category_id`;

const getVideos = (where, params, order = 'v.published_at DESC', limit = 12, offset = 0) =>
  db.all(`SELECT ${VCOLS} ${VFROM} WHERE ${PUB} ${where ? 'AND ' + where : ''} ORDER BY ${order} LIMIT ${+limit} OFFSET ${+offset}`, params);
const countVideos = async (where, params) =>
  (await db.one(`SELECT COUNT(*)::int n ${VFROM} WHERE ${PUB} ${where ? 'AND ' + where : ''}`, params)).n;

async function trending(limit, excludeId) {
  return db.all(`SELECT ${VCOLS}, COALESCE(e.n,0) AS hot ${VFROM}
    LEFT JOIN (SELECT video_id, COUNT(*) n FROM events WHERE type='play' AND ts>NOW()-INTERVAL '7 days' GROUP BY video_id) e ON e.video_id=v.id
    WHERE ${PUB} AND v.kind='video' AND v.id<>$1
    ORDER BY hot DESC, v.yt_views DESC, v.published_at DESC LIMIT ${+limit}`, [excludeId || 0]);
}

async function getAd(position) {
  return db.one(`SELECT * FROM ads WHERE active AND position=$1
    AND (starts_at IS NULL OR starts_at<=NOW()) AND (ends_at IS NULL OR ends_at>=NOW())
    ORDER BY sort, random() LIMIT 1`, [position]);
}

// ======================================================================
//  SMALL VIEW HELPERS
// ======================================================================
const vUrl = (v) => `/v/${v.id}`;
const ytUrl = (v) => v.kind === 'short' ? `https://www.youtube.com/shorts/${v.yt_id}` : `https://www.youtube.com/watch?v=${v.yt_id}`;
const viewsOf = (v) => Math.max(Number(v.yt_views) || 0, Number(v.plays) || 0);
const modeOf = (v) => (v.play_mode && v.play_mode !== 'inherit') ? v.play_mode : (S('play_mode') || 'inline');

function dataV(v, lang) {
  return esc(JSON.stringify({ id: v.id, y: v.yt_id, k: v.kind === 'short' ? 's' : 'v', m: modeOf(v), t: f(v, 'title', lang), u: vUrl(v) }));
}

function adHTML(ad, lang, cls = '') {
  if (!ad) return '';
  const label = f(ad, 'label', lang) || t(lang, 'sponsored');
  const href = ad.link ? `/go/${ad.id}` : '';
  const wrap = (inner) => href
    ? `<a class="ad-link" href="${href}" target="_blank" rel="sponsored noopener">${inner}</a>` : inner;
  let body = '';
  if (ad.kind === 'html') body = ad.html; // raw code from admin (e.g. Google AdSense)
  else if (ad.kind === 'image' && ad.image) {
    body = wrap(`<picture>${ad.image_mobile ? `<source media="(max-width:640px)" srcset="${esc(ad.image_mobile)}">` : ''}<img src="${esc(ad.image)}" alt="${esc(f(ad, 'title', lang) || label)}" loading="lazy" decoding="async"></picture>`);
  } else {
    body = wrap(`<span class="ad-title">${icon('verified')}${esc(f(ad, 'title', lang))}</span>${f(ad, 'text', lang) ? `<span class="ad-text">${esc(f(ad, 'text', lang))}</span>` : ''}`);
  }
  return `<aside class="ad ad-${esc(ad.position)} ad-k-${esc(ad.kind)} ${cls}" data-ad="${ad.id}"><span class="ad-label">${esc(label)}</span>${body}</aside>`;
}

function cardVideo(v, lang, opt = {}) {
  const title = f(v, 'title', lang), desc = f(v, 'desc', lang), badge = opt.badge !== undefined ? opt.badge : f(v, 'badge', lang);
  const place = f(v, 'place', lang);
  const cat = v.cat_slug ? (lang === 'bn' ? v.cat_bn : v.cat_en) || v.cat_en : '';
  return `<article class="card">
<a class="card-a" href="${vUrl(v)}" data-v="${dataV(v, lang)}">
<div class="thumb"><img src="${esc(thumbOf(v))}" alt="${esc(title)}" loading="lazy" decoding="async" width="480" height="270">
${v.duration ? `<span class="dur">${esc(num(v.duration, lang))}</span>` : ''}
${badge ? `<span class="badge ${opt.badgeCls || ''}">${esc(badge)}</span>` : ''}
${place ? `<span class="place">${icon('pin')}${esc(place)}</span>` : ''}
<span class="play-ov"><span class="play-btn">${icon('play')}</span></span></div>
<div class="card-b">
<div class="meta">${opt.top || (cat ? `<span class="m-cat">${esc(cat)}</span>` : '<span></span>')}<span>${esc(timeAgo(v.published_at, lang))}</span></div>
<h3>${esc(title)}</h3>${desc && opt.desc !== false ? `<p>${esc(desc)}</p>` : ''}
</div></a>
<div class="card-f"><span>${icon('eye')}${compact(viewsOf(v), lang)} ${esc(t(lang, 'views'))}</span>${opt.foot || ''}</div>
</article>`;
}

function cardShort(v, lang) {
  return `<a class="short" href="${vUrl(v)}" data-v="${dataV(v, lang)}">
<img src="${esc(v.thumb_url || ytThumb(v.yt_id, 'hqdefault'))}" alt="${esc(f(v, 'title', lang))}" loading="lazy" decoding="async">
<span class="short-tag">${esc(t(lang, 'shorts'))}</span>
<span class="short-b"><b>${esc(f(v, 'title', lang))}</b><span>${icon('eye')}${compact(viewsOf(v), lang)}</span></span></a>`;
}

function sectionHead(icn, title, sub, moreHref, lang, extra = '') {
  return `<div class="sec-h"><div class="sec-t"><span class="sec-i">${icon(icn)}</span><div><h2>${esc(title)}${extra}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div></div>
${moreHref ? `<a class="more" href="${moreHref}">${esc(t(lang, 'explore_all'))}${icon('right')}</a>` : ''}</div>`;
}

function pager(page, total, per, base, lang) {
  const pages = Math.ceil(total / per);
  if (pages <= 1) return '';
  const sep = base.includes('?') ? '&' : '?';
  let h = '<nav class="pager">';
  if (page > 1) h += `<a href="${base}${sep}page=${page - 1}">${icon('left')}</a>`;
  for (let i = Math.max(1, page - 3); i <= Math.min(pages, page + 3); i++) {
    h += i === page ? `<span class="on">${num(i, lang)}</span>` : `<a href="${base}${sep}page=${i}">${num(i, lang)}</a>`;
  }
  if (page < pages) h += `<a href="${base}${sep}page=${page + 1}">${icon('right')}</a>`;
  return h + '</nav>';
}

// ======================================================================
//  LAYOUT
// ======================================================================
async function layout(req, o) {
  const lang = req.lang;
  const st = cache.settings;
  const siteName = S('site_name', lang);
  const title = o.title ? `${o.title} | ${siteName}` : `${siteName} | ${S('tagline', lang)}`;
  const desc = o.desc || S('meta_desc', lang);
  const base = config.siteUrl;
  const img = o.image || (S('og_image').startsWith('http') ? S('og_image') : base + S('og_image'));
  const headerAd = await getAd('header');
  const footerAd = await getAd('footer');
  const navCats = cache.cats.filter((c) => c.in_nav);
  const navMenus = cache.menus.filter((m) => m.location === 'nav');
  const cur = req.path;
  const navLink = (href, label, extraCls = '') => `<a href="${href}" class="${cur === href ? 'on' : ''} ${extraCls}">${esc(label)}</a>`;
  const other = lang === 'bn' ? 'en' : 'bn';
  const ticker = st.show_ticker === '1' ? cache.ticker : [];
  const socials = ['facebook', 'youtube', 'instagram', 'tiktok', 'x'].filter((s) => st['social_' + s]);
  const pc = st.primary_color || '#b70011', ac = st.accent_color || '#dc2626';
  const ga = (st.ga_id || '').trim(), px = (st.pixel_id || '').trim();
  const cfg = {
    lang, mini: st.mini_player === '1', hover: st.hover_preview === '1', auto: st.hero_autoplay === '1',
    track: st.self_analytics === '1', ga: !!ga, px: !!px,
    tx: { copied: t(lang, 'copied'), saved: t(lang, 'saved'), save: t(lang, 'save'), min: t(lang, 'minimize'), close: t(lang, 'close'), expand: t(lang, 'expand'), yt: t(lang, 'open_youtube'), unmute: t(lang, 'tap_unmute'), nores: t(lang, 'no_results') }
  };
  const fcol = (loc) => cache.menus.filter((m) => m.location === loc)
    .map((m) => `<li><a href="${esc(m.url)}"${m.new_tab ? ' target="_blank" rel="noopener"' : ''}>${esc(f(m, 'label', lang))}</a></li>`).join('');

  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(base + (o.canonical || req.path))}">
<link rel="alternate" hreflang="bn" href="${esc(base + req.path)}?lang=bn"><link rel="alternate" hreflang="en" href="${esc(base + req.path)}?lang=en">
<meta property="og:type" content="${o.ogType || 'website'}"><meta property="og:site_name" content="${esc(siteName)}"><meta property="og:title" content="${esc(o.title || siteName)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:image" content="${esc(img)}"><meta property="og:url" content="${esc(base + req.path)}">
<meta name="twitter:card" content="summary_large_image"><meta name="theme-color" content="${esc(pc)}">
<link rel="icon" href="${esc(S('favicon') || '/img/favicon.png')}"><link rel="apple-touch-icon" href="/img/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://i.ytimg.com"><link rel="dns-prefetch" href="https://www.youtube-nocookie.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&family=Merriweather:wght@700;900&family=Noto+Serif+Bengali:wght@600;800&family=Public+Sans:wght@400;500;600;800&display=swap">
<link rel="stylesheet" href="/css/site.css?v=${ASSET_V}">
<style>:root{--p:${esc(pc)};--pc:${esc(ac)}}</style>
${o.jsonld ? `<script type="application/ld+json">${JSON.stringify(o.jsonld).replace(/</g, '\\u003c')}</script>` : ''}
${ga ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(ga)}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config',${JSON.stringify(ga)});</script>` : ''}
${px ? `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${JSON.stringify(px)});fbq('track','PageView');</script><noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${esc(px)}&ev=PageView&noscript=1" alt=""></noscript>` : ''}
${st.head_code || ''}
</head><body>${sprite}
<header class="hdr">
${st.show_topbar === '1' ? `<div class="topbar"><div class="wrap tb-in">
<div class="tb-l"><span class="tb-date">${esc(fullDate(new Date(), lang))}</span>${S('topbar_info', lang) ? `<span class="tb-sep">|</span><span>${esc(S('topbar_info', lang))}</span>` : ''}
${st.show_market === '1' && S('market', lang) ? `<span class="tb-sep hide-md">|</span><span class="tb-mkt hide-md">${icon('trending')}${esc(S('market', lang))}</span>` : ''}</div>
<div class="tb-r"><div class="lang-sw"><a href="?lang=bn" class="${lang === 'bn' ? 'on' : ''}" hreflang="bn">বাংলা</a><span>/</span><a href="?lang=en" class="${lang === 'en' ? 'on' : ''}" hreflang="en">EN</a></div>
<a class="tb-ic" href="/saved" title="${esc(t(lang, 'saved'))}">${icon('bookmark')}<span class="hide-sm">${esc(t(lang, 'saved'))}</span></a>
${socials.map((s) => `<a class="tb-ic hide-sm" href="${esc(st['social_' + s])}" target="_blank" rel="noopener" aria-label="${s}">${icon(s)}</a>`).join('')}
</div></div></div>` : ''}
<div class="wrap brand-row">
<a class="brand" href="/"><img src="${esc(S('logo') || '/img/logo.png')}" alt="${esc(siteName)}" width="48" height="48"><span class="brand-t"><b>${esc(S('site_name_bn') || siteName)}</b><small>${esc(S('tagline', lang))}</small></span></a>
${headerAd ? adHTML(headerAd, lang, 'hide-lg-down') : ''}
<div class="brand-r">
<form class="hsearch" action="/search" role="search"><input name="q" type="search" placeholder="${esc(t(lang, 'search_ph'))}" aria-label="${esc(t(lang, 'search'))}"><button aria-label="${esc(t(lang, 'search'))}">${icon('search')}</button></form>
<button class="icon-btn show-sm" id="mSearch" aria-label="${esc(t(lang, 'search'))}">${icon('search')}</button>
${st.youtube_channel_url ? `<a class="btn btn-p" href="${esc(st.youtube_channel_url)}" target="_blank" rel="noopener">${icon('youtube')}<span>${esc(S('subscribe_text', lang))}</span></a>` : ''}
</div></div>
<nav class="nav"><div class="wrap nav-in">
${navLink('/', t(lang, 'home'))}${navLink('/videos', t(lang, 'latest'))}${navLink('/shorts', t(lang, 'shorts'))}
${navCats.map((c) => navLink('/c/' + c.slug, f(c, 'name', lang))).join('')}
${navMenus.map((m) => `<a href="${esc(m.url)}"${m.new_tab ? ' target="_blank" rel="noopener"' : ''}>${esc(f(m, 'label', lang))}</a>`).join('')}
</div></nav>
${ticker.length ? `<div class="ticker"><div class="wrap tk-in"><span class="tk-l"><i></i>${esc(S('ticker_label', lang))}</span>
<div class="tk-vp"><div class="tk-track">${[0, 1].map((r) => ticker.map((x) => {
    const tx = esc(f(x, 'text', lang)); return x.link ? `<a href="${esc(x.link)}"${r ? ' aria-hidden="true" tabindex="-1"' : ''}>${tx}</a>` : `<span${r ? ' aria-hidden="true"' : ''}>${tx}</span>`;
  }).join('<b>•</b>')).join('<b>•</b>')}</div></div></div></div>` : ''}
</header>
<main id="main">${o.body}</main>
${footerAd ? `<div class="wrap">${adHTML(footerAd, lang, 'ad-wide')}</div>` : ''}
<footer class="ftr"><div class="wrap ft-grid">
<div class="ft-about"><a class="brand sm" href="/"><img src="${esc(S('logo') || '/img/logo.png')}" alt="" width="36" height="36" loading="lazy"><b>${esc(siteName)}</b></a>
<p>${esc(S('footer_about', lang))}</p>
<div class="ft-soc">${socials.map((s) => `<a href="${esc(st['social_' + s])}" target="_blank" rel="noopener" aria-label="${s}">${icon(s)}</a>`).join('')}${st.contact_email ? `<a href="mailto:${esc(st.contact_email)}" aria-label="email">${icon('mail')}</a>` : ''}</div></div>
<div><h4>${esc(S('footer_col1', lang))}</h4><ul>${fcol('footer1')}</ul></div>
<div><h4>${esc(S('footer_col2', lang))}</h4><ul>${fcol('footer2')}</ul></div>
${st.show_newsletter === '1' ? `<div><h4>${esc(t(lang, 'newsletter_title'))}</h4><p>${esc(t(lang, 'newsletter_text'))}</p>
<form class="nl" id="nlForm"><input type="email" name="email" required placeholder="${esc(t(lang, 'email_ph'))}"><button class="btn btn-p w100">${esc(t(lang, 'subscribe_now'))}</button><small class="nl-msg" data-ok="${esc(t(lang, 'thanks_sub'))}" data-bad="${esc(t(lang, 'invalid_email'))}"></small></form></div>` : ''}
</div><div class="wrap ft-bot"><p>${esc(S('copyright', lang))}</p><div>${cache.menus.filter((m) => m.location === 'bottom').map((m) => `<a href="${esc(m.url)}">${esc(f(m, 'label', lang))}</a>`).join('<span>•</span>')}</div></div></footer>
<div id="kkp" class="kkp" hidden><div class="kkp-bg" data-x="close"></div><div class="kkp-box"><div class="kkp-bar"><b class="kkp-t"></b><span class="kkp-ctl">
<button data-x="prev" title="prev">${icon('prev')}</button><button data-x="next" title="next">${icon('next')}</button>
<a data-x="yt" target="_blank" rel="noopener" title="${esc(t(lang, 'open_youtube'))}">${icon('youtube')}</a><a data-x="page" title="${esc(t(lang, 'expand'))}">${icon('out')}</a>
<button data-x="min" class="kkp-min" title="${esc(t(lang, 'minimize'))}">${icon('pip')}</button><button data-x="max" class="kkp-max" title="${esc(t(lang, 'expand'))}">${icon('expand')}</button><button data-x="close" title="${esc(t(lang, 'close'))}">${icon('close')}</button></span></div>
<div class="kkp-frame"></div></div></div>
<div id="toast" class="toast" role="status"></div>
<script>window.KK=${JSON.stringify(cfg).replace(/</g, '\\u003c')}</script>
<script src="/js/site.js?v=${ASSET_V}" defer></script>
${st.body_code || ''}
</body></html>`;
}

// ======================================================================
//  PAGES
// ======================================================================
async function heroVideo() {
  if (S('hero_mode') === 'featured') {
    const ft = await getVideos(`v.is_featured AND v.kind='video'`, [], 'v.published_at DESC', 1);
    if (ft[0]) return ft[0];
  }
  return (await getVideos(`v.kind='video'`, [], 'v.published_at DESC', 1))[0];
}

function heroHTML(v, lang, opts = {}) {
  if (!v) return '';
  const st = cache.settings;
  const seriesTotal = opts.seriesTotal;
  const cat = v.cat_slug ? f({ name_bn: v.cat_bn, name_en: v.cat_en }, 'name', lang) : '';
  const mode = modeOf(v);
  const autoplay = st.hero_autoplay === '1' && mode !== 'youtube';
  return `<section class="hero">
<div class="hero-v" id="heroV" data-v="${dataV(v, lang)}" data-auto="${autoplay ? 1 : 0}">
<div class="hero-in">
<img class="hero-img" src="https://i.ytimg.com/vi/${esc(v.yt_id)}/maxresdefault.jpg" ${v.thumb_url ? `data-src="${esc(v.thumb_url)}"` : ''} onerror="this.onerror=null;this.src=this.dataset.src||'https://i.ytimg.com/vi/${esc(v.yt_id)}/hqdefault.jpg'" alt="${esc(f(v, 'title', lang))}" fetchpriority="high" width="1280" height="720">
<div class="hero-scrim"></div>
<div class="hero-tags">${f(v, 'badge', lang) ? `<span class="tag tag-p">${esc(f(v, 'badge', lang))}</span>` : ''}<span class="tag tag-w">${icon('youtube')}YouTube</span></div>
${v.duration ? `<span class="hero-dur">${icon('clock')}${esc(num(v.duration, lang))}</span>` : ''}
<button class="hero-play" aria-label="${esc(t(lang, 'watch_full'))}">${icon('play')}</button>
<div class="hero-hud"><span><i class="ping"></i>${esc(t(lang, 'now_streaming'))}${v.episode ? ` • ${esc(t(lang, 'episode'))} ${num(String(v.episode).padStart(2, '0'), lang)}` : ''}</span></div>
<button class="mini-x" aria-label="${esc(t(lang, 'close'))}">${icon('close')}</button>
</div>
</div>
<div class="hero-r">
<div><div class="hero-k"><span>${esc(cat || f(v, 'badge', lang))}</span><span>${esc(timeAgo(v.published_at, lang))}</span></div>
<h1 class="hero-h">${esc(f(v, 'title', lang))}</h1>
<p class="hero-p">${esc(f(v, 'desc', lang))}</p>
<div class="stats"><div><b>${compact(viewsOf(v), lang)}</b><small>${esc(t(lang, 'youtube_views'))}</small></div>
<div><b>${esc(num(v.duration || '—', lang))}</b><small>${esc(t(lang, 'duration'))}</small></div>
<div><b>${v.episode && seriesTotal ? esc(t(lang, 'ep_of', { a: num(v.episode, lang), b: num(seriesTotal, lang) })) : esc(cat || '—')}</b><small>${esc(v.episode ? t(lang, 'series') : t(lang, 'featured'))}</small></div></div>
${st.channel_name ? `<div class="chan"><img src="${esc(S('logo'))}" alt="" width="40" height="40" loading="lazy"><div><b>${esc(st.channel_name)} ${icon('verified', 'ic-v')}</b><small>${esc(S('channel_subs', lang))}</small></div></div>` : ''}
</div>
<div class="hero-act"><button class="btn btn-p grow" data-play>${icon('play')}${esc(t(lang, 'watch_full'))}</button>
<button class="sq" data-save="${v.id}" aria-label="${esc(t(lang, 'save'))}">${icon('bookmark')}</button>
<button class="sq" data-share="${esc(config.siteUrl + vUrl(v))}" data-title="${esc(f(v, 'title', lang))}" aria-label="${esc(t(lang, 'share'))}">${icon('share')}</button>
<a class="sq" href="${esc(ytUrl(v))}" target="_blank" rel="noopener" aria-label="YouTube">${icon('youtube')}</a></div>
</div></section>`;
}

async function renderSection(sec, lang, heroId) {
  const title = f(sec, 'title', lang), sub = f(sec, 'sub', lang), n = sec.limit_n || 8;
  if (sec.kind === 'shorts') {
    const vs = await getVideos(`v.kind='short'`, [], 'v.published_at DESC', n);
    if (!vs.length) return '';
    return `<section class="sec">${sectionHead('play', title, sub, '/shorts', lang, `<span class="pill-yt">YouTube Shorts</span>`)}
<div class="shelf-w"><button class="shelf-b l" aria-label="prev">${icon('left')}</button><div class="shelf">${vs.map((v) => cardShort(v, lang)).join('')}</div><button class="shelf-b r" aria-label="next">${icon('right')}</button></div></section>`;
  }
  if (sec.kind === 'series') {
    const s = sec.series_id ? await db.one('SELECT * FROM series WHERE id=$1 AND active', [sec.series_id]) : null;
    if (!s) return '';
    const vs = await getVideos(`v.series_id=$1`, [s.id], 'v.episode NULLS LAST, v.published_at', n);
    if (!vs.length) return '';
    const total = await countVideos('v.series_id=$1', [s.id]);
    return `<section class="sec panel"><div class="sec-h"><div><div class="ser-k">${f(s, 'badge', lang) ? `<span class="tag tag-s">${esc(f(s, 'badge', lang))}</span>` : ''}<span>${num(total, lang)} ${esc(t(lang, 'episodes'))}</span></div>
<h2>${icon('film', 'ic-h')} ${esc(title || f(s, 'title', lang))}</h2>${f(s, 'desc', lang) ? `<p>${esc(f(s, 'desc', lang))}</p>` : ''}</div>
<a class="btn btn-l" href="/s/${esc(s.slug)}">${icon('playlist')}${esc(t(lang, 'play_all'))}</a></div>
<div class="grid g3">${vs.map((v) => cardVideo(v, lang, {
      badge: v.episode ? `${t(lang, 'episode')} ${num(String(v.episode).padStart(2, '0'), lang)}` : '', badgeCls: 'b-dark',
      top: f(v, 'place', lang) ? `<span class="m-cat">${esc(f(v, 'place', lang))}</span>` : undefined,
      foot: v.episode ? `<span>${esc(t(lang, 'ep_of', { a: num(v.episode, lang), b: num(total, lang) }))}</span>` : ''
    })).join('')}</div></section>`;
  }
  let vs = [], more = '/videos', icn = 'film';
  if (sec.kind === 'trending') { vs = await trending(n, heroId); icn = 'fire'; more = '/videos?sort=views'; }
  else if (sec.kind === 'latest') vs = await getVideos(`v.kind='video' AND v.id<>$1`, [heroId || 0], 'v.published_at DESC', n);
  else if (sec.kind === 'featured') { vs = await getVideos(`v.is_featured AND v.id<>$1`, [heroId || 0], 'v.published_at DESC', n); icn = 'verified'; more = ''; }
  else if (sec.kind === 'category' && sec.category_id) {
    vs = await getVideos(`v.category_id=$1 AND v.kind='video'`, [sec.category_id], 'v.published_at DESC', n); icn = 'globe';
    const c = cache.cats.find((x) => x.id === sec.category_id); more = c ? '/c/' + c.slug : '';
  }
  if (!vs.length) return '';
  return `<section class="sec">${sectionHead(icn, title, sub, more, lang)}
<div class="grid g4">${vs.map((v, i) => cardVideo(v, lang, sec.kind === 'trending' && !f(v, 'badge', lang) ? { badge: '#' + num(i + 1, lang) } : {})).join('')}</div></section>`;
}

async function home(req) {
  const lang = req.lang;
  const hero = await heroVideo();
  let seriesTotal = 0;
  if (hero && hero.series_id) seriesTotal = await countVideos('v.series_id=$1', [hero.series_id]);
  const sections = await db.all('SELECT * FROM sections WHERE active ORDER BY sort,id');
  const [adTop, adMid] = await Promise.all([getAd('home_top'), getAd('home_middle')]);
  const rendered = await Promise.all(sections.map((s) => renderSection(s, lang, hero && hero.id)));
  const nonEmpty = rendered.filter(Boolean);
  if (adMid && nonEmpty.length > 1) nonEmpty.splice(2, 0, `<div>${adHTML(adMid, lang, 'ad-wide')}</div>`);
  const st = cache.settings;
  const total = await countVideos('', []);
  const body = `${pillBar(req, '')}
<div class="wrap stack">
${heroHTML(hero, lang, { seriesTotal })}
${adTop ? adHTML(adTop, lang, 'ad-wide') : ''}
${S('intro_title', lang) ? `<div class="intro"><div class="intro-l"><span class="intro-i">${icon('film')}</span><div><h3>${esc(S('intro_title', lang))}</h3><p>${esc(S('intro_text', lang))}</p></div></div>
<div class="intro-r"><span class="cnt">${num(total, lang)} ${esc(t(lang, 'videos_count'))}</span><form action="/videos" class="sortf">${icon('tune')}<select name="sort" onchange="this.form.submit()" aria-label="sort">
<option value="recent">${esc(t(lang, 'sort_recent'))}</option><option value="views">${esc(t(lang, 'sort_views'))}</option><option value="old">${esc(t(lang, 'sort_old'))}</option></select></form></div></div>` : ''}
${nonEmpty.join('\n')}
${st.show_strip === '1' ? `<div class="strip"><div class="strip-l"><span class="strip-i">${icon('youtube')}</span><div><h4>${esc(S('strip_title', lang))}</h4><p>${esc(S('strip_text', lang))}</p></div></div>
<div class="strip-r"><a class="btn btn-g" href="/contact">${esc(t(lang, 'suggest_story'))}</a>${st.youtube_channel_url ? `<a class="btn btn-p" href="${esc(st.youtube_channel_url)}" target="_blank" rel="noopener">${icon('out')}${esc(t(lang, 'open_youtube'))}</a>` : ''}</div></div>` : ''}
</div>`;
  const jsonld = { '@context': 'https://schema.org', '@type': 'WebSite', name: S('site_name', lang), url: config.siteUrl, potentialAction: { '@type': 'SearchAction', target: config.siteUrl + '/search?q={q}', 'query-input': 'required name=q' } };
  return layout(req, { body, jsonld });
}

function pillBar(req, active) {
  const lang = req.lang;
  const pills = cache.cats.filter((c) => c.in_pills);
  return `<div class="pillbar"><div class="wrap pb-in"><span class="net">${icon('play')}${esc(S('network_badge', lang))}</span>
<div class="pills"><a href="/videos" class="${active === 'all' ? 'on' : ''}">${esc(t(lang, 'all_videos'))}</a><a href="/shorts" class="${active === 'shorts' ? 'on' : ''}">${esc(t(lang, 'shorts'))}</a>
${pills.map((c) => `<a href="/c/${esc(c.slug)}" class="${active === c.slug ? 'on' : ''}">${esc(f(c, 'name', lang))}</a>`).join('')}</div></div></div>`;
}

async function listPage(req, o) {
  const lang = req.lang;
  const per = o.kind === 'short' ? 20 : 16;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const sort = { views: 'v.yt_views DESC, v.plays DESC', old: 'v.published_at ASC' }[req.query.sort] || 'v.published_at DESC';
  const total = await countVideos(o.where, o.params);
  const vs = await getVideos(o.where, o.params, o.order || sort, per, (page - 1) * per);
  const ad = await getAd('list_top');
  const grid = vs.length
    ? (o.kind === 'short' ? `<div class="grid gs">${vs.map((v) => cardShort(v, lang)).join('')}</div>`
      : `<div class="grid g4">${vs.map((v) => cardVideo(v, lang)).join('')}</div>`)
    : `<div class="empty">${icon('search')}<p>${esc(t(lang, 'no_results'))}</p><a class="btn btn-l" href="/">${esc(t(lang, 'back_home'))}</a></div>`;
  const qs = new URLSearchParams(); if (req.query.q) qs.set('q', req.query.q); if (req.query.sort) qs.set('sort', req.query.sort);
  const base = req.path + (qs.toString() ? '?' + qs : '');
  const sortSel = o.noSort ? '' : `<form class="sortf">${req.query.q ? `<input type="hidden" name="q" value="${esc(req.query.q)}">` : ''}${icon('tune')}<select name="sort" onchange="this.form.submit()" aria-label="sort">
${[['recent', 'sort_recent'], ['views', 'sort_views'], ['old', 'sort_old']].map(([v, k]) => `<option value="${v}" ${req.query.sort === v ? 'selected' : ''}>${esc(t(lang, k))}</option>`).join('')}</select></form>`;
  const body = `${pillBar(req, o.active)}<div class="wrap stack">
<div class="page-h"><div>${o.kicker ? `<span class="kick">${esc(o.kicker)}</span>` : ''}<h1>${esc(o.title)}</h1>${o.sub ? `<p>${esc(o.sub)}</p>` : ''}<small>${num(total, lang)} ${esc(t(lang, 'videos_count'))}</small></div>${sortSel}</div>
${ad ? adHTML(ad, lang, 'ad-wide') : ''}${grid}${pager(page, total, per, base, lang)}</div>`;
  return layout(req, { title: o.title, desc: o.sub, body, canonical: req.path });
}

async function videoPage(req, v) {
  const lang = req.lang;
  const title = f(v, 'title', lang), desc = f(v, 'desc', lang);
  const isShort = v.kind === 'short';
  let related = [];
  if (cache.settings.show_related === '1') {
    if (v.series_id) related = await getVideos('v.series_id=$1 AND v.id<>$2', [v.series_id, v.id], 'v.episode NULLS LAST, v.published_at', 12);
    if (related.length < 8) related = related.concat(await getVideos(`v.id<>$1 AND v.kind=$2 ${v.category_id ? 'AND v.category_id=' + (+v.category_id) : ''} AND NOT (v.id = ANY($3))`, [v.id, v.kind, related.map((r) => r.id)], 'v.published_at DESC', 10 - related.length));
    if (related.length < 6) related = related.concat(await getVideos(`v.id<>$1 AND NOT (v.id = ANY($2))`, [v.id, related.map((r) => r.id)], 'v.published_at DESC', 8 - related.length));
  }
  const series = v.series_id ? await db.one('SELECT * FROM series WHERE id=$1', [v.series_id]) : null;
  const ad = await getAd('video_page');
  const cat = v.cat_slug ? f({ name_bn: v.cat_bn, name_en: v.cat_en }, 'name', lang) : '';
  const shareUrl = config.siteUrl + vUrl(v);
  const autoplay = cache.settings.hero_autoplay === '1' || req.query.play === '1';
  const body = `<div class="wrap vp ${isShort ? 'vp-short' : ''}">
<div class="vp-main">
<div class="hero-v vp-player ${isShort ? 'is-short' : ''}" id="heroV" data-v="${dataV({ ...v, play_mode: 'inline' }, lang)}" data-auto="${autoplay ? 1 : 0}"><div class="hero-in">
<img class="hero-img" src="${esc(isShort ? (v.thumb_url || ytThumb(v.yt_id)) : 'https://i.ytimg.com/vi/' + v.yt_id + '/maxresdefault.jpg')}" ${v.thumb_url ? `data-src="${esc(v.thumb_url)}"` : ''} onerror="this.onerror=null;this.src=this.dataset.src||'https://i.ytimg.com/vi/${esc(v.yt_id)}/hqdefault.jpg'" alt="${esc(title)}" fetchpriority="high">
<div class="hero-scrim"></div><button class="hero-play" aria-label="play">${icon('play')}</button>
<button class="mini-x" aria-label="${esc(t(lang, 'close'))}">${icon('close')}</button></div></div>
<div class="vp-info">
<div class="vp-k">${cat ? `<a href="/c/${esc(v.cat_slug)}" class="tag tag-p">${esc(cat)}</a>` : ''}${f(v, 'badge', lang) ? `<span class="tag tag-s">${esc(f(v, 'badge', lang))}</span>` : ''}${f(v, 'place', lang) ? `<span class="vp-place">${icon('pin')}${esc(f(v, 'place', lang))}</span>` : ''}</div>
<h1>${esc(title)}</h1>
<div class="vp-meta"><span>${icon('eye')}${compact(viewsOf(v), lang)} ${esc(t(lang, 'views'))}</span><span>${icon('clock')}${esc(timeAgo(v.published_at, lang))}</span>${v.duration ? `<span>${icon('play')}${esc(num(v.duration, lang))}</span>` : ''}
${series ? `<a href="/s/${esc(series.slug)}">${icon('playlist')}${esc(f(series, 'title', lang))}${v.episode ? ` • ${esc(t(lang, 'episode'))} ${num(v.episode, lang)}` : ''}</a>` : ''}</div>
<div class="vp-act"><button class="btn btn-l" data-save="${v.id}">${icon('bookmark')}<span>${esc(t(lang, 'save'))}</span></button>
<button class="btn btn-l" data-share="${esc(shareUrl)}" data-title="${esc(title)}">${icon('share')}<span>${esc(t(lang, 'share'))}</span></button>
<a class="btn btn-l" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}">${icon('facebook')}Facebook</a>
<a class="btn btn-l" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(title + ' ' + shareUrl)}">WhatsApp</a>
<a class="btn btn-p" href="${esc(ytUrl(v))}" target="_blank" rel="noopener">${icon('youtube')}${esc(t(lang, 'open_youtube'))}</a></div>
${desc ? `<div class="vp-desc"><h4>${esc(t(lang, 'description'))}</h4>${esc(desc).replace(/\n/g, '<br>')}</div>` : ''}
${ad ? adHTML(ad, lang, 'ad-wide') : ''}
</div></div>
${related.length ? `<aside class="vp-side"><h3>${esc(t(lang, 'related'))}</h3><div class="rel">${related.map((r) => `<a class="rel-i" href="${vUrl(r)}" data-v="${dataV({ ...r, play_mode: 'page' }, lang)}"><span class="rel-t ${r.kind === 'short' ? 'is-s' : ''}"><img src="${esc(thumbOf(r))}" alt="" loading="lazy" decoding="async">${r.duration ? `<span class="dur">${esc(num(r.duration, lang))}</span>` : ''}</span>
<span class="rel-b"><b>${esc(f(r, 'title', lang))}</b><small>${compact(viewsOf(r), lang)} ${esc(t(lang, 'views'))} • ${esc(timeAgo(r.published_at, lang))}</small></span></a>`).join('')}</div></aside>` : ''}
</div>`;
  const thumb = v.thumb_url || ytThumb(v.yt_id, 'hqdefault');
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'VideoObject', name: title, description: desc || title,
    thumbnailUrl: [thumb], uploadDate: new Date(v.published_at).toISOString(), embedUrl: `https://www.youtube.com/embed/${v.yt_id}`,
    contentUrl: ytUrl(v), interactionStatistic: { '@type': 'InteractionCounter', interactionType: { '@type': 'WatchAction' }, userInteractionCount: viewsOf(v) }
  };
  return layout(req, { title, desc: desc.slice(0, 160) || title, image: thumb, body, ogType: 'video.other', jsonld, canonical: vUrl(v) });
}

async function notFound(req, res) {
  const lang = req.lang;
  res.status(404).send(await layout(req, { title: t(lang, 'not_found'), body: `<div class="wrap"><div class="empty big"><b>404</b><p>${esc(t(lang, 'not_found'))}</p><a class="btn btn-p" href="/">${esc(t(lang, 'back_home'))}</a></div></div>` }));
}

// ======================================================================
//  ANALYTICS (self-hosted) — called by site.js using navigator.sendBeacon
// ======================================================================
const hits = new Map(); // simple rate limiter per ip
function limited(ip, key, max, windowMs) {
  const k = key + ip, now = Date.now();
  const h = hits.get(k) || { n: 0, at: now };
  if (now - h.at > windowMs) { h.n = 0; h.at = now; }
  h.n++; hits.set(k, h);
  return h.n > max;
}
setInterval(() => { const now = Date.now(); for (const [k, h] of hits) if (now - h.at > 3600000) hits.delete(k); }, 600000).unref();

async function track(req, type, extra = {}) {
  if (cache.settings && cache.settings.self_analytics !== '1') return;
  const ua = req.get('user-agent') || '';
  if (L.isBot(ua)) return;
  const { device, browser, os } = L.parseUA(ua);
  let ref = '';
  try { ref = extra.ref ? new URL(extra.ref).hostname.replace(/^www\./, '') : ''; } catch { ref = ''; }
  const own = (() => { try { return new URL(config.siteUrl).hostname.replace(/^www\./, ''); } catch { return ''; } })();
  if (ref === own || ref === req.hostname) ref = '';
  const visitor = String(extra.vid || '').slice(0, 40) || crypto.createHash('sha1').update((req.ip || '') + ua).digest('hex').slice(0, 16);
  await db.q(`INSERT INTO events(type,path,video_id,ad_id,visitor,device,browser,os,referrer,lang) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [type, String(extra.path || '').slice(0, 300), extra.video || null, extra.ad || null, visitor, device, browser, os, ref.slice(0, 120), req.lang || '']);
}

// ======================================================================
//  ROUTES
// ======================================================================
function register(app) {
  const r = express.Router();

  // Serve cached HTML for anonymous GETs (super fast)
  const cached = (fn) => async (req, res, next) => {
    try {
      await L.ensure();
      const key = req.lang + '|' + req.originalUrl;
      const hit = cache.pages.get(key);
      if (hit && hit.exp > Date.now()) { res.set('X-Cache', 'HIT'); return res.type('html').send(hit.html); }
      const html = await fn(req, res, next);
      if (typeof html !== 'string') return; // handler already responded
      if (res.statusCode === 200) cache.pages.set(key, { html, exp: Date.now() + config.pageCacheSeconds * 1000 });
      if (cache.pages.size > 2000) cache.pages.clear();
      res.set('Cache-Control', 'public, max-age=0, must-revalidate').type('html').send(html);
    } catch (e) { next(e); }
  };

  r.get('/', cached(home));
  r.get('/videos', cached((req) => listPage(req, { title: t(req.lang, 'all_videos'), where: `v.kind='video'`, params: [], active: 'all' })));
  r.get('/shorts', cached((req) => listPage(req, { title: t(req.lang, 'shorts'), where: `v.kind='short'`, params: [], kind: 'short', active: 'shorts' })));
  r.get('/c/:slug', cached(async (req, res) => {
    const c = cache.cats.find((x) => x.slug === req.params.slug);
    if (!c) return notFound(req, res);
    return listPage(req, { title: f(c, 'name', req.lang), where: 'v.category_id=$1', params: [c.id], active: c.slug });
  }));
  r.get('/s/:slug', cached(async (req, res) => {
    const s = await db.one('SELECT * FROM series WHERE slug=$1 AND active', [req.params.slug]);
    if (!s) return notFound(req, res);
    return listPage(req, { title: f(s, 'title', req.lang), sub: f(s, 'desc', req.lang), kicker: f(s, 'badge', req.lang), where: 'v.series_id=$1', params: [s.id], order: 'v.episode NULLS LAST, v.published_at', noSort: true });
  }));
  r.get('/search', cached(async (req) => {
    const qs = String(req.query.q || '').trim().slice(0, 100);
    const like = '%' + qs.replace(/[%_\\]/g, '\\$&') + '%';
    return listPage(req, {
      title: qs ? `${t(req.lang, 'search_results')}: “${qs}”` : t(req.lang, 'search'),
      where: qs ? '(v.title_bn ILIKE $1 OR v.title_en ILIKE $1 OR v.desc_bn ILIKE $1 OR v.desc_en ILIKE $1 OR v.place_bn ILIKE $1 OR v.place_en ILIKE $1)' : 'FALSE',
      params: qs ? [like] : []
    });
  }));
  r.get('/v/:id', cached(async (req, res) => {
    const id = parseInt(req.params.id);
    const v = id ? await db.one(`SELECT ${VCOLS} ${VFROM} WHERE ${PUB} AND v.id=$1`, [id]) : null;
    if (!v) return notFound(req, res);
    return videoPage(req, v);
  }));
  r.get('/p/:slug', cached(async (req, res) => {
    const p = await db.one('SELECT * FROM pages WHERE slug=$1 AND active', [req.params.slug]);
    if (!p) return notFound(req, res);
    // page body is HTML written by the super admin
    return layout(req, { title: f(p, 'title', req.lang), body: `<div class="wrap narrow"><article class="prose"><h1>${esc(f(p, 'title', req.lang))}</h1>${f(p, 'body', req.lang)}</article></div>` });
  }));
  r.get('/saved', cached((req) => layout(req, {
    title: t(req.lang, 'saved'),
    body: `<div class="wrap stack"><div class="page-h"><div><h1>${icon('bookmarked', 'ic-h')} ${esc(t(req.lang, 'saved'))}</h1></div></div><div id="savedList" class="grid g4"></div><div id="savedEmpty" class="empty" hidden>${icon('bookmark')}<p>${esc(t(req.lang, 'no_results'))}</p></div></div>`
  })));
  r.get('/contact', cached((req) => {
    const lang = req.lang;
    return layout(req, {
      title: t(lang, 'contact'),
      body: `<div class="wrap narrow"><div class="prose"><h1>${esc(t(lang, 'suggest_story'))}</h1>
<form class="cform" id="cForm"><label>${esc(t(lang, 'your_name'))}<input name="name" required maxlength="100"></label>
<label>Email<input name="email" type="email" maxlength="150"></label><label>${esc(t(lang, 'phone'))}<input name="phone" maxlength="30"></label>
<label>${esc(t(lang, 'message'))}<textarea name="body" rows="6" required maxlength="5000"></textarea></label>
<input name="website" class="hp" tabindex="-1" autocomplete="off">
<button class="btn btn-p">${esc(t(lang, 'send'))}</button><p class="cmsg" data-ok="${esc(t(lang, 'msg_sent'))}"></p></form></div></div>`
    });
  }));

  // ---- JSON / tracking endpoints ----
  r.get('/api/videos', async (req, res) => {
    await L.ensure();
    const ids = String(req.query.ids || '').split(',').map(Number).filter(Boolean).slice(0, 100);
    if (!ids.length) return res.json({ html: '' });
    const vs = await getVideos('v.id = ANY($1)', [ids], 'v.published_at DESC', 100);
    res.json({ html: vs.map((v) => cardVideo(v, req.lang)).join('') });
  });

  r.post('/api/ev', express.text({ type: '*/*', limit: '4kb' }), async (req, res) => {
    res.status(204).end();
    try {
      if (limited(req.ip, 'ev', 300, 600000)) return;
      const b = JSON.parse(req.body || '{}');
      await L.ensure();
      const type = String(b.t || '');
      if (!['pageview', 'play', 'ad_view', 'share'].includes(type)) return;
      const video = parseInt(b.v) || null, ad = parseInt(b.a) || null;
      await track(req, type, { path: b.p, ref: b.r, vid: b.u, video, ad });
      if (type === 'play' && video) await db.q('UPDATE videos SET plays=plays+1 WHERE id=$1', [video]);
      if (type === 'ad_view' && ad) await db.q('UPDATE ads SET impressions=impressions+1 WHERE id=$1', [ad]);
    } catch { /* ignore bad beacons */ }
  });

  r.get('/go/:id', async (req, res) => {
    const ad = await db.one('SELECT id,link FROM ads WHERE id=$1', [parseInt(req.params.id) || 0]);
    if (!ad || !ad.link) return res.redirect('/');
    db.q('UPDATE ads SET clicks=clicks+1 WHERE id=$1', [ad.id]).catch(() => {});
    track(req, 'ad_click', { ad: ad.id, path: req.get('referer') || '' }).catch(() => {});
    res.redirect(302, ad.link);
  });

  r.post('/api/subscribe', express.json({ limit: '2kb' }), async (req, res) => {
    if (limited(req.ip, 'sub', 10, 3600000)) return res.status(429).json({ ok: false });
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 150) return res.status(400).json({ ok: false });
    await db.q('INSERT INTO subscribers(email,lang) VALUES($1,$2) ON CONFLICT (email) DO NOTHING', [email, req.lang]);
    res.json({ ok: true });
  });

  r.post('/api/contact', express.json({ limit: '10kb' }), async (req, res) => {
    const b = req.body || {};
    if (b.website) return res.json({ ok: true }); // honeypot (bots)
    if (limited(req.ip, 'msg', 5, 3600000)) return res.status(429).json({ ok: false });
    const name = String(b.name || '').trim().slice(0, 100), body = String(b.body || '').trim().slice(0, 5000);
    if (!name || !body) return res.status(400).json({ ok: false });
    await db.q('INSERT INTO messages(name,email,phone,body) VALUES($1,$2,$3,$4)', [name, String(b.email || '').slice(0, 150), String(b.phone || '').slice(0, 30), body]);
    res.json({ ok: true });
  });

  r.get('/robots.txt', (req, res) => res.type('text').send(`User-agent: *\nDisallow: ${config.adminPath}\nDisallow: /api/\nSitemap: ${config.siteUrl}/sitemap.xml\n`));
  r.get('/sitemap.xml', async (req, res) => {
    await L.ensure();
    const vs = await db.all(`SELECT id, updated_at FROM videos v WHERE ${PUB} ORDER BY published_at DESC LIMIT 5000`);
    const ss = await db.all('SELECT slug FROM series WHERE active');
    const ps = await db.all('SELECT slug FROM pages WHERE active');
    const u = (p, d) => `<url><loc>${esc(config.siteUrl + p)}</loc>${d ? `<lastmod>${new Date(d).toISOString()}</lastmod>` : ''}</url>`;
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${u('/')}${u('/videos')}${u('/shorts')}${cache.cats.map((c) => u('/c/' + c.slug)).join('')}${ss.map((s) => u('/s/' + s.slug)).join('')}${ps.map((p) => u('/p/' + p.slug)).join('')}${vs.map((v) => u('/v/' + v.id, v.updated_at)).join('')}</urlset>`);
  });

  app.use(r);
  return { notFound };
}

module.exports = { register, notFound, layout };
