// =====================================================================
//  ADMIN PANEL — super admin + editor accounts
//  URL: /admin   (change the path in config.js → adminPath)
// =====================================================================
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const config = require('./config');
const db = require('./db');
const L = require('./lib');
const { esc } = L;

const A = config.adminPath;
const UP_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UP_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: UP_DIR,
    filename: (req, file, cb) => cb(null, Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex') + (path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.jpg'))
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 6 },
  fileFilter: (req, file, cb) => cb(null, /\.(png|jpe?g|webp|gif|ico|avif)$/i.test(file.originalname) && /^image\//.test(file.mimetype))
});

// Modules that can be given to editors (super admin always has everything)
const PERMS = {
  videos: 'Videos & Shorts', series: 'Series / Playlists', categories: 'Categories', sections: 'Home Sections',
  ads: 'Sponsored Ads', ticker: 'Breaking Ticker', menus: 'Menus', pages: 'Pages', labels: 'Text Labels',
  subscribers: 'Subscribers', messages: 'Messages', analytics: 'Analytics', settings: 'Site Settings'
};
const can = (u, p) => u && (u.role === 'super' || String(u.perms || '').split(',').includes(p));

// ---------------------------------------------------------------- utils
const BD = 6 * 3600 * 1000; // Bangladesh is UTC+6
const toLocalInput = (d) => d ? new Date(new Date(d).getTime() + BD).toISOString().slice(0, 16) : '';
const fromLocalInput = (s) => s ? new Date(new Date(s + ':00Z').getTime() - BD) : null;
const fmtDate = (d) => d ? new Date(new Date(d).getTime() + BD).toISOString().slice(0, 16).replace('T', ' ') : '—';
const n0 = (x) => Number(x || 0).toLocaleString('en-US');
const ago = (d) => L.timeAgo(d, 'en');

async function log(req, action) {
  try { await db.q('INSERT INTO activity(user_id,action) VALUES($1,$2)', [req.user ? req.user.id : null, String(action).slice(0, 300)]); } catch { /* ignore */ }
}

// ---------------------------------------------------------------- icons (admin)
const I = {
  dash: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  chart: 'M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z',
  video: 'M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z',
  list: 'M3 10h11v2H3zm0-4h11v2H3zm0 8h7v2H3zm13-1v8l6-4z',
  tag: 'M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58s1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41s-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z',
  layout: 'M3 5v14h18V5H3zm16 6h-6V7h6v4zM5 7h6v10H5V7zm8 10v-4h6v4h-6z',
  ad: 'M18 11v2h4v-2h-4zm-2 6.61c.96.71 2.21 1.65 3.2 2.39.4-.53.8-1.07 1.2-1.6-.99-.74-2.24-1.68-3.2-2.4-.4.54-.8 1.08-1.2 1.61zM20.4 5.6c-.4-.53-.8-1.07-1.2-1.6-.99.74-2.24 1.68-3.2 2.4.4.53.8 1.07 1.2 1.6.96-.72 2.21-1.65 3.2-2.4zM4 9c-1.1 0-2 .9-2 2v2c0 1.1.9 2 2 2h1v4h2v-4h1l5 3V6L8 9H4zm11.5 3c0-1.33-.58-2.53-1.5-3.35v6.69c.92-.81 1.5-2.01 1.5-3.34z',
  bolt: 'M7 2v11h3v9l7-12h-4l4-8z',
  menu: 'M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z',
  page: 'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z',
  text: 'M5 4v3h5.5v12h3V7H19V4z',
  mail: 'M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z',
  chat: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z',
  users: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
  gear: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
  hist: 'M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.95 8.95 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z',
  user: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
  out: 'M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z',
  ext: 'M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z',
  plus: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  star: 'M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
  starO: 'M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z',
  edit: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
  del: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  search: 'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  dl: 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z',
  eye: 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z',
  play: 'M8 5v14l11-7z'
};
const ic = (n, c = '') => `<svg class="ic ${c}" viewBox="0 0 24 24" aria-hidden="true"><path d="${I[n] || ''}"/></svg>`;

// ---------------------------------------------------------------- layout
function nav(u, cur) {
  const items = [
    ['', 'Dashboard', 'dash', null], ['/analytics', 'Analytics', 'chart', 'analytics'],
    ['#', 'CONTENT'], ['/videos', 'Videos & Shorts', 'video', 'videos'], ['/videos/new', 'Add Video', 'plus', 'videos'],
    ['/r/series', 'Series / Playlists', 'list', 'series'], ['/r/categories', 'Categories', 'tag', 'categories'],
    ['/r/sections', 'Home Sections', 'layout', 'sections'], ['/r/ticker', 'Breaking Ticker', 'bolt', 'ticker'],
    ['#', 'MONETIZE'], ['/r/ads', 'Sponsored Ads', 'ad', 'ads'],
    ['#', 'SITE'], ['/r/menus', 'Menus', 'menu', 'menus'], ['/r/pages', 'Pages', 'page', 'pages'], ['/labels', 'Text Labels', 'text', 'labels'],
    ['/settings', 'Site Settings', 'gear', 'settings'],
    ['#', 'PEOPLE'], ['/messages', 'Messages', 'chat', 'messages'], ['/subscribers', 'Subscribers', 'mail', 'subscribers'],
    ['/users', 'Users', 'users', '__super'], ['/activity', 'Activity Log', 'hist', '__super']
  ];
  let h = '', pendingHead = null;
  for (const [href, label, icon, perm] of items) {
    if (href === '#') { pendingHead = label; continue; }
    if (perm === '__super' ? u.role !== 'super' : (perm && !can(u, perm))) continue;
    if (pendingHead) { h += `<div class="nh">${pendingHead}</div>`; pendingHead = null; }
    const on = cur === href || (href && href !== '/videos/new' && cur.startsWith(href + '/') && href !== '/videos') || (href === '/videos' && cur === '/videos');
    h += `<a href="${A}${href}" class="${on ? 'on' : ''}">${ic(icon)}<span>${label}</span></a>`;
  }
  return h;
}

function page(req, title, body, o = {}) {
  const u = req.user;
  const st = L.cache.settings || {};
  const flash = req.flash ? `<div class="flash ${req.flash.t}">${esc(req.flash.m)}</div>` : '';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Admin · ${esc(st.site_name_en || 'Site')}</title><meta name="robots" content="noindex">
<link rel="icon" href="${esc(st.favicon || '/img/favicon.png')}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;600&family=Inter:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/css/admin.css?v=3"></head><body>
<aside class="side" id="side"><a class="logo" href="${A}"><img src="${esc(st.logo || '/img/logo.png')}" alt=""><span><b>${esc(st.site_name_bn || '')}</b><small>Admin Panel</small></span></a>
<nav>${nav(u, o.cur || '')}</nav>
<div class="side-f"><a href="/" target="_blank">${ic('ext')}<span>View website</span></a></div></aside>
<div class="main"><header class="top"><button class="burger" onclick="document.body.classList.toggle('nav-open')" aria-label="menu">${ic('menu')}</button>
<h1>${esc(title)}</h1><div class="top-r">${o.actions || ''}
<a class="who" href="${A}/account" title="My account">${ic('user')}<span>${esc(u.name || u.username)} <small>${u.role === 'super' ? 'Super Admin' : 'Editor'}</small></span></a>
<form method="post" action="${A}/logout"><input type="hidden" name="_csrf" value="${esc(req.session.csrf)}"><button class="icon" title="Log out">${ic('out')}</button></form></div></header>
<div class="content">${flash}${body}</div></div>
<div class="scrim" onclick="document.body.classList.remove('nav-open')"></div>
<script>window.CSRF=${JSON.stringify(req.session.csrf)};window.ADMIN=${JSON.stringify(A)};</script><script src="/js/admin.js?v=3" defer></script></body></html>`;
}

// ---------------------------------------------------------------- form fields
function fieldHTML(fd, v) {
  const id = 'f_' + fd.name;
  const help = fd.help ? `<small class="help">${fd.help}</small>` : '';
  const req = fd.req ? ' required' : '';
  const val = v == null ? (fd.def != null ? fd.def : '') : v;
  switch (fd.type) {
    case 'bool':
      return `<label class="chk"><input type="hidden" name="${fd.name}" value="0"><input type="checkbox" name="${fd.name}" value="1" ${(val === true || val === '1' || val === 1) ? 'checked' : ''}><span>${esc(fd.label)}</span></label>${help}`;
    case 'textarea': case 'html': case 'code':
      return `<label for="${id}">${esc(fd.label)}</label><textarea id="${id}" name="${fd.name}" rows="${fd.rows || (fd.type === 'textarea' ? 3 : 8)}" class="${fd.type !== 'textarea' ? 'mono' : ''}"${req}>${esc(val)}</textarea>${help}`;
    case 'select':
      return `<label for="${id}">${esc(fd.label)}</label><select id="${id}" name="${fd.name}"${req}>${(fd.options || []).map(([k, l]) => `<option value="${esc(k)}" ${String(val) === String(k) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>${help}`;
    case 'datetime':
      return `<label for="${id}">${esc(fd.label)}</label><input type="datetime-local" id="${id}" name="${fd.name}" value="${esc(val instanceof Date || (val && typeof val === 'object') ? toLocalInput(val) : (val ? toLocalInput(val) : ''))}">${help}`;
    case 'int':
      return `<label for="${id}">${esc(fd.label)}</label><input type="number" id="${id}" name="${fd.name}" value="${esc(val)}"${req}>${help}`;
    case 'color':
      return `<label for="${id}">${esc(fd.label)}</label><div class="color"><input type="color" value="${esc(val || '#000000')}" oninput="this.nextElementSibling.value=this.value"><input id="${id}" name="${fd.name}" value="${esc(val)}" pattern="#[0-9a-fA-F]{6}"></div>${help}`;
    case 'image':
      return `<label for="${id}">${esc(fd.label)}</label><div class="img-f">${val ? `<img src="${esc(val)}" alt="">` : '<span class="noimg">No image</span>'}<div><input id="${id}" name="${fd.name}" value="${esc(val)}" placeholder="https://... or upload →"><input type="file" name="${fd.name}__file" accept="image/*"></div></div>${help}`;
    case 'password':
      return `<label for="${id}">${esc(fd.label)}</label><input type="password" id="${id}" name="${fd.name}" autocomplete="new-password"${req}>${help}`;
    default:
      return `<label for="${id}">${esc(fd.label)}</label><input id="${id}" name="${fd.name}" value="${esc(val)}" ${fd.ph ? `placeholder="${esc(fd.ph)}"` : ''} ${fd.maxlength ? `maxlength="${fd.maxlength}"` : ''}${req}>${help}`;
  }
}
// bilingual field → two inputs (বাংলা / English)
function fieldsHTML(fields, row = {}) {
  return fields.map((fd) => {
    if (fd.section) return `<h3 class="fs-h">${esc(fd.section)}${fd.note ? `<small>${fd.note}</small>` : ''}</h3>`;
    if (fd.bi) {
      const mk = (lng, label) => fieldHTML({ ...fd, name: `${fd.name}_${lng}`, label: `${fd.label} (${label})`, req: fd.req && lng === 'bn' ? false : fd.req && lng === 'en' ? false : false, help: '' }, row[`${fd.name}_${lng}`]);
      return `<div class="row2 ${fd.wide ? 'wide' : ''}"><div class="fld">${mk('bn', 'বাংলা')}</div><div class="fld">${mk('en', 'English')}</div>${fd.help ? `<small class="help full">${fd.help}</small>` : ''}</div>`;
    }
    return `<div class="fld ${fd.half ? 'half' : ''} ${fd.type === 'bool' ? 'is-bool' : ''}">${fieldHTML(fd, row[fd.name])}</div>`;
  }).join('');
}
function flatFields(fields) {
  const out = [];
  for (const fd of fields) {
    if (fd.section || fd.readonly) continue;
    if (fd.bi) { out.push({ ...fd, name: fd.name + '_bn', bi: false }); out.push({ ...fd, name: fd.name + '_en', bi: false }); }
    else out.push(fd);
  }
  return out;
}
function readValue(fd, req) {
  const b = req.body || {};
  let raw = b[fd.name];
  if (Array.isArray(raw)) raw = raw[raw.length - 1]; // checkbox hidden+checked pair
  if (fd.type === 'image') {
    const file = (req.files || []).find((x) => x.fieldname === fd.name + '__file');
    if (file) return '/uploads/' + file.filename;
    return String(raw || '').trim();
  }
  if (fd.type === 'bool') return raw === '1' || raw === 'on';
  if (fd.type === 'int') { const n = parseInt(raw); return Number.isFinite(n) ? n : (fd.nullable ? null : 0); }
  if (fd.type === 'datetime') return raw ? fromLocalInput(raw) : null;
  if (fd.type === 'select' && fd.nullable && (raw === '' || raw == null)) return null;
  if (fd.type === 'select' && fd.intVal) return raw === '' || raw == null ? null : parseInt(raw);
  return raw == null ? '' : String(raw).trim();
}

// ---------------------------------------------------------------- resources (generic CRUD)
const catOptions = async () => [['', '— none —'], ...(await db.all('SELECT id,name_en,name_bn FROM categories ORDER BY sort,id')).map((c) => [c.id, `${c.name_en} / ${c.name_bn}`])];
const seriesOptions = async () => [['', '— none —'], ...(await db.all('SELECT id,title_en,title_bn FROM series ORDER BY sort,id')).map((s) => [s.id, `${s.title_en} / ${s.title_bn}`])];
const AD_POS = [['header', 'Header bulletin (next to logo, desktop)'], ['home_top', 'Home — below main video'], ['home_middle', 'Home — between sections'], ['video_page', 'Video page — under the player'], ['list_top', 'Category / search pages — top'], ['footer', 'Above footer (all pages)']];

const RES = {
  series: {
    perm: 'series', title: 'Series / Playlists', table: 'series', order: 'sort,id', single: 'Series',
    list: [['title_en', 'Title'], ['title_bn', 'শিরোনাম'], ['slug', 'Link', (r) => `<a href="/s/${esc(r.slug)}" target="_blank">/s/${esc(r.slug)}</a>`], ['n', 'Videos'], ['active', 'Active']],
    listSql: 'SELECT s.*, (SELECT COUNT(*) FROM videos v WHERE v.series_id=s.id)::int AS n FROM series s ORDER BY s.sort, s.id',
    fields: [
      { name: 'title', label: 'Title', bi: true, req: true },
      { name: 'slug', label: 'URL slug', help: 'Leave empty to create from English title. Used in link: /s/slug' },
      { name: 'desc', label: 'Description', bi: true, type: 'textarea' },
      { name: 'badge', label: 'Badge', bi: true, help: 'Small label e.g. “Flagship Docuseries”' },
      { name: 'sort', label: 'Order (small first)', type: 'int', def: 0, half: true },
      { name: 'active', label: 'Active', type: 'bool', def: true, half: true }
    ],
    before: (d) => { d.slug = L.slugify(d.slug || d.title_en || d.title_bn) || 'series-' + Date.now(); }
  },
  categories: {
    perm: 'categories', title: 'Categories', table: 'categories', order: 'sort,id', single: 'Category',
    list: [['name_en', 'Name'], ['name_bn', 'নাম'], ['slug', 'Link', (r) => `<a href="/c/${esc(r.slug)}" target="_blank">/c/${esc(r.slug)}</a>`], ['n', 'Videos'], ['in_nav', 'In main menu'], ['in_pills', 'In pill bar'], ['active', 'Active'], ['sort', 'Order']],
    listSql: 'SELECT c.*, (SELECT COUNT(*) FROM videos v WHERE v.category_id=c.id)::int AS n FROM categories c ORDER BY c.sort, c.id',
    fields: [
      { name: 'name', label: 'Name', bi: true, req: true },
      { name: 'slug', label: 'URL slug', help: 'Leave empty to create automatically. Link: /c/slug' },
      { name: 'in_nav', label: 'Show in main navigation menu', type: 'bool', def: true },
      { name: 'in_pills', label: 'Show in category pill bar', type: 'bool', def: true },
      { name: 'active', label: 'Active', type: 'bool', def: true },
      { name: 'sort', label: 'Order (small first)', type: 'int', def: 0 }
    ],
    before: (d) => { d.slug = L.slugify(d.slug || d.name_en || d.name_bn) || 'cat-' + Date.now(); }
  },
  sections: {
    perm: 'sections', title: 'Home Page Sections', table: 'sections', order: 'sort,id', single: 'Section',
    intro: 'These rows appear on the home page under the main video, in this order. A section with no videos is hidden automatically.',
    list: [['sort', 'Order'], ['title_en', 'Title'], ['kind', 'Type'], ['limit_n', 'Max videos'], ['active', 'Active']],
    fields: async () => [
      { name: 'kind', label: 'Section type', type: 'select', options: [['latest', 'Latest videos'], ['trending', 'Trending (most played this week)'], ['featured', 'Featured videos (★ in Videos)'], ['category', 'One category'], ['shorts', 'YouTube Shorts shelf'], ['series', 'A series / playlist']] },
      { name: 'title', label: 'Title', bi: true },
      { name: 'sub', label: 'Subtitle', bi: true },
      { name: 'category_id', label: 'Category (for type “One category”)', type: 'select', options: await catOptions(), intVal: true },
      { name: 'series_id', label: 'Series (for type “A series”)', type: 'select', options: await seriesOptions(), intVal: true },
      { name: 'limit_n', label: 'How many videos', type: 'int', def: 8, half: true },
      { name: 'sort', label: 'Order (small first)', type: 'int', def: 0, half: true },
      { name: 'active', label: 'Active', type: 'bool', def: true }
    ]
  },
  ticker: {
    perm: 'ticker', title: 'Breaking Ticker', table: 'ticker', order: 'sort,id', single: 'Ticker item',
    intro: 'Scrolling headlines under the menu. Turn the whole ticker on/off in Settings.',
    list: [['text_bn', 'বাংলা'], ['text_en', 'English'], ['active', 'Active'], ['sort', 'Order']],
    fields: [
      { name: 'text', label: 'Headline', bi: true, req: true, wide: true },
      { name: 'link', label: 'Link (optional)', ph: '/v/12 or https://...' },
      { name: 'sort', label: 'Order', type: 'int', def: 0, half: true },
      { name: 'active', label: 'Active', type: 'bool', def: true, half: true }
    ]
  },
  ads: {
    perm: 'ads', title: 'Sponsored Ads', table: 'ads', order: 'position,sort,id', single: 'Ad',
    intro: 'If a position has no active ad (or the dates have passed), nothing is shown there. Several active ads in one position rotate.',
    list: [['name', 'Name'], ['position', 'Position', (r) => esc((AD_POS.find((p) => p[0] === r.position) || [, r.position])[1])], ['kind', 'Type'],
      ['live', 'Status', (r) => {
        const now = Date.now(); const live = r.active && (!r.starts_at || new Date(r.starts_at) <= now) && (!r.ends_at || new Date(r.ends_at) >= now);
        return live ? '<span class="pill ok">Live</span>' : r.active ? '<span class="pill warn">Scheduled / expired</span>' : '<span class="pill">Off</span>';
      }],
      ['impressions', 'Views', (r) => n0(r.impressions)], ['clicks', 'Clicks', (r) => n0(r.clicks)], ['ctr', 'CTR', (r) => r.impressions ? (100 * r.clicks / r.impressions).toFixed(2) + '%' : '—']],
    fields: [
      { name: 'name', label: 'Internal name (only you see it)', req: true },
      { name: 'position', label: 'Where to show', type: 'select', options: AD_POS },
      { name: 'kind', label: 'Ad type', type: 'select', options: [['text', 'Text ad'], ['image', 'Image / banner'], ['html', 'HTML code (Google AdSense etc.)']] },
      { name: 'label', label: 'Small label', bi: true, help: 'e.g. “Sponsored” / “স্পনসরড”. Empty = default.' },
      { name: 'title', label: 'Title (text ad)', bi: true },
      { name: 'text', label: 'Text (text ad)', bi: true },
      { name: 'image', label: 'Banner image (desktop)', type: 'image', help: 'Header: ~468×60. Wide positions: ~1200×150.' },
      { name: 'image_mobile', label: 'Banner image for mobile (optional)', type: 'image' },
      { name: 'link', label: 'Click goes to (URL)', ph: 'https://sponsor.com' },
      { name: 'html', label: 'HTML code (only for HTML type)', type: 'code', rows: 6 },
      { name: 'starts_at', label: 'Start (optional)', type: 'datetime', half: true },
      { name: 'ends_at', label: 'End (optional)', type: 'datetime', half: true },
      { name: 'sort', label: 'Order', type: 'int', def: 0, half: true },
      { name: 'active', label: 'Active', type: 'bool', def: true, half: true }
    ]
  },
  menus: {
    perm: 'menus', title: 'Menus', table: 'menus', order: 'location,sort,id', single: 'Menu link',
    intro: 'Footer column 1, footer column 2, the bottom footer line, and extra links in the main navigation (categories are added there automatically).',
    list: [['location', 'Place'], ['label_en', 'Label'], ['label_bn', 'লেবেল'], ['url', 'URL'], ['active', 'Active'], ['sort', 'Order']],
    fields: [
      { name: 'location', label: 'Place', type: 'select', options: [['footer1', 'Footer column 1'], ['footer2', 'Footer column 2'], ['bottom', 'Footer bottom line'], ['nav', 'Main navigation (extra link)']] },
      { name: 'label', label: 'Label', bi: true, req: true },
      { name: 'url', label: 'URL', req: true, ph: '/p/about or https://...' },
      { name: 'new_tab', label: 'Open in new tab', type: 'bool' },
      { name: 'sort', label: 'Order', type: 'int', def: 0, half: true },
      { name: 'active', label: 'Active', type: 'bool', def: true, half: true }
    ]
  },
  pages: {
    perm: 'pages', title: 'Pages', table: 'pages', order: 'id', single: 'Page',
    intro: 'Static pages like About, Privacy, Terms. Link: /p/slug. You can write simple HTML (&lt;p&gt;, &lt;h2&gt;, &lt;a&gt;, &lt;img&gt;).',
    list: [['title_en', 'Title'], ['title_bn', 'শিরোনাম'], ['slug', 'Link', (r) => `<a href="/p/${esc(r.slug)}" target="_blank">/p/${esc(r.slug)}</a>`], ['active', 'Active']],
    fields: [
      { name: 'title', label: 'Title', bi: true, req: true },
      { name: 'slug', label: 'URL slug', help: 'Leave empty to create automatically.' },
      { name: 'body_bn', label: 'Content (বাংলা) — HTML allowed', type: 'html', rows: 12 },
      { name: 'body_en', label: 'Content (English) — HTML allowed', type: 'html', rows: 12 },
      { name: 'active', label: 'Active', type: 'bool', def: true }
    ],
    before: (d) => { d.slug = L.slugify(d.slug || d.title_en || d.title_bn) || 'page-' + Date.now(); d.updated_at = new Date(); }
  }
};

// ---------------------------------------------------------------- video fields
async function videoFields() {
  return [
    { section: 'YouTube link', note: 'Paste any YouTube link (watch, youtu.be, shorts). Then press “Fetch info”.' },
    { name: 'yt_url', label: 'YouTube link', req: true, ph: 'https://www.youtube.com/watch?v=...' },
    { name: 'kind', label: 'Type', type: 'select', options: [['video', 'Normal video (16:9)'], ['short', 'YouTube Short (vertical)']], half: true },
    { name: 'status', label: 'Status', type: 'select', options: [['published', 'Published'], ['draft', 'Draft (hidden)']], half: true },
    { section: 'Text' },
    { name: 'title', label: 'Title', bi: true, req: true, wide: true },
    { name: 'desc', label: 'Short description', bi: true, type: 'textarea' },
    { section: 'Organize' },
    { name: 'category_id', label: 'Category', type: 'select', options: await catOptions(), intVal: true, half: true },
    { name: 'series_id', label: 'Series / playlist', type: 'select', options: await seriesOptions(), intVal: true, half: true },
    { name: 'episode', label: 'Episode number (if in a series)', type: 'int', nullable: true, half: true },
    { name: 'published_at', label: 'Publish date (future = scheduled)', type: 'datetime', half: true, help: 'Empty = now. The newest published video becomes the main video (if hero mode is “latest”).' },
    { name: 'badge', label: 'Badge on thumbnail', bi: true, help: 'e.g. “Investigation”, “Trending”. Optional.' },
    { name: 'place', label: 'Location tag', bi: true, help: 'e.g. “Bangkok”, “Padma River Basin”. Optional.' },
    { section: 'Display & player' },
    { name: 'is_featured', label: '★ Featured (used for main video when hero mode = “Featured”, and in “Featured” sections)', type: 'bool' },
    { name: 'play_mode', label: 'When someone clicks this video', type: 'select', half: true, options: [['inherit', 'Use site default (Settings → Player)'], ['inline', 'Play directly on the site (popup player)'], ['page', 'Open the video page'], ['youtube', 'Open on YouTube']] },
    { name: 'duration', label: 'Duration (e.g. 18:42)', half: true },
    { name: 'yt_views', label: 'YouTube view count (shown on site)', type: 'int', half: true },
    { name: 'thumb_url', label: 'Custom thumbnail (optional — YouTube thumbnail is used if empty)', type: 'image' }
  ];
}

// ---------------------------------------------------------------- settings groups
const SETTINGS = [
  { id: 'general', title: 'General & Branding', fields: [
    { name: 'site_name', label: 'Site name', bi: true },
    { name: 'tagline', label: 'Tagline (under the logo)', bi: true },
    { name: 'meta_desc', label: 'SEO description (Google)', bi: true, type: 'textarea' },
    { name: 'logo', label: 'Logo (square works best)', type: 'image' },
    { name: 'favicon', label: 'Favicon (browser tab icon)', type: 'image' },
    { name: 'og_image', label: 'Share image (Facebook / WhatsApp preview)', type: 'image' },
    { name: 'default_lang', label: 'Default language for new visitors', type: 'select', options: [['bn', 'বাংলা'], ['en', 'English']], half: true },
    { name: 'primary_color', label: 'Main color', type: 'color', half: true },
    { name: 'accent_color', label: 'Button color', type: 'color', half: true }
  ] },
  { id: 'player', title: 'Video Player', fields: [
    { name: 'hero_mode', label: 'Main (big) video on home page', type: 'select', options: [['latest', 'Latest uploaded video (automatic)'], ['featured', 'Newest ★ Featured video (falls back to latest)']] },
    { name: 'play_mode', label: 'When a visitor clicks a video card', type: 'select', options: [['inline', 'Play directly on the site (popup player + mini player)'], ['page', 'Open the video page on this site'], ['youtube', 'Open on YouTube (new tab)']], help: 'Each video can override this in its own settings.' },
    { name: 'hero_autoplay', label: 'Autoplay the main video (starts muted — browsers require this — with a “tap to unmute” button)', type: 'bool' },
    { name: 'mini_player', label: 'Mini player: keep playing in a small floating window when scrolling / minimizing', type: 'bool' },
    { name: 'hover_preview', label: 'Hover preview: play a silent preview when the mouse is over a card (desktop)', type: 'bool' },
    { name: 'show_related', label: 'Show “Up next” related videos on the video page', type: 'bool' },
    { name: 'yt_api_key', label: 'YouTube Data API key (optional)', help: 'With a key, “Fetch info” also fills duration and view count. Get one free at console.cloud.google.com → YouTube Data API v3.' }
  ] },
  { id: 'header', title: 'Header, Ticker & Home texts', fields: [
    { name: 'show_topbar', label: 'Show the dark top bar (date, info, language switch)', type: 'bool' },
    { name: 'topbar_info', label: 'Top bar info (e.g. weather)', bi: true },
    { name: 'show_market', label: 'Show market price line in top bar', type: 'bool' },
    { name: 'market', label: 'Market price line', bi: true, wide: true },
    { name: 'show_ticker', label: 'Show breaking ticker', type: 'bool' },
    { name: 'ticker_label', label: 'Ticker label', bi: true },
    { name: 'youtube_channel_url', label: 'YouTube channel link (Subscribe button)' },
    { name: 'subscribe_text', label: 'Subscribe button text', bi: true },
    { name: 'channel_name', label: 'Channel name (shown under main video)' },
    { name: 'channel_subs', label: 'Channel subscriber text', bi: true },
    { name: 'network_badge', label: 'Red badge in pill bar', bi: true },
    { name: 'intro_title', label: 'Info banner title (under main video) — empty hides it', bi: true },
    { name: 'intro_text', label: 'Info banner text', bi: true },
    { name: 'show_strip', label: 'Show dark bottom strip on home page', type: 'bool' },
    { name: 'strip_title', label: 'Bottom strip title', bi: true },
    { name: 'strip_text', label: 'Bottom strip text', bi: true, type: 'textarea' }
  ] },
  { id: 'footer', title: 'Footer & Social', fields: [
    { name: 'footer_about', label: 'About text', bi: true, type: 'textarea' },
    { name: 'footer_col1', label: 'Footer column 1 title', bi: true },
    { name: 'footer_col2', label: 'Footer column 2 title', bi: true },
    { name: 'copyright', label: 'Copyright line', bi: true },
    { name: 'show_newsletter', label: 'Show newsletter signup in footer', type: 'bool' },
    { name: 'social_facebook', label: 'Facebook URL', half: true }, { name: 'social_youtube', label: 'YouTube URL', half: true },
    { name: 'social_instagram', label: 'Instagram URL', half: true }, { name: 'social_tiktok', label: 'TikTok URL', half: true },
    { name: 'social_x', label: 'X / Twitter URL', half: true }, { name: 'contact_email', label: 'Contact email', half: true }
  ] },
  { id: 'tracking', title: 'Analytics & Tracking', fields: [
    { name: 'ga_id', label: 'Google Analytics 4 Measurement ID', ph: 'G-XXXXXXXXXX', help: 'Google Analytics → Admin → Data streams → your site → Measurement ID. Sends page views + “video_play” events.' },
    { name: 'pixel_id', label: 'Meta (Facebook) Pixel ID', ph: '123456789012345', help: 'Events Manager → your Pixel → ID. Sends PageView, ViewContent (video play), Lead (newsletter), Contact.' },
    { name: 'self_analytics', label: 'Built-in analytics (Analytics page in this panel)', type: 'bool' },
    { name: 'head_code', label: 'Extra code inside &lt;head&gt; (Search Console verification, etc.)', type: 'code', rows: 5 },
    { name: 'body_code', label: 'Extra code before &lt;/body&gt; (chat widgets, etc.)', type: 'code', rows: 5 }
  ] }
];

// ---------------------------------------------------------------- charts (simple SVG)
function barChart(values, labels, o = {}) {
  const W = 760, H = o.h || 200, pl = 48, pb = 22, pt = 10;
  const max = Math.max(1, ...values);
  const nice = Math.pow(10, Math.floor(Math.log10(max))); const top = Math.max(4, Math.ceil(max / nice) * nice);
  const bw = (W - pl) / values.length;
  const ticks = [0, top / 2, top];
  const every = Math.ceil(values.length / 8);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title || 'chart')}">
${ticks.map((tk) => { const y = pt + (H - pt - pb) * (1 - tk / top); return `<line x1="${pl}" x2="${W}" y1="${y}" y2="${y}" class="grid"/><text x="${pl - 6}" y="${y + 4}" class="ax" text-anchor="end">${n0(Math.round(tk))}</text>`; }).join('')}
${values.map((v, i) => { const h = (H - pt - pb) * (v / top); const x = pl + i * bw + Math.max(1, bw * 0.18); const w = Math.max(2, bw * 0.64);
    return `<g class="bar"><rect x="${pl + i * bw}" y="${pt}" width="${bw}" height="${H - pt - pb}" class="hit"/><path d="M${x},${H - pb} V${H - pb - Math.max(h, 0) + Math.min(4, h)} q0,-${Math.min(4, h)} ${Math.min(4, h)},-${Math.min(4, h)} h${Math.max(0, w - 2 * Math.min(4, h))} q${Math.min(4, h)},0 ${Math.min(4, h)},${Math.min(4, h)} V${H - pb} Z"/><title>${esc(labels[i])}: ${n0(v)} ${esc(o.unit || '')}</title></g>
${i % every === 0 ? `<text x="${pl + i * bw + bw / 2}" y="${H - 6}" class="ax" text-anchor="middle">${esc(labels[i])}</text>` : ''}`;
  }).join('')}</svg>`;
}
function hbars(rows, o = {}) {
  if (!rows.length) return '<p class="muted">No data yet.</p>';
  const max = Math.max(1, ...rows.map((r) => +r.n));
  return `<div class="hb">${rows.map((r) => `<div class="hb-r"><span class="hb-l" title="${esc(r.label)}">${o.link && r.href ? `<a href="${esc(r.href)}" target="_blank">${esc(r.label)}</a>` : esc(r.label || '(none)')}</span><span class="hb-b"><i style="width:${(100 * r.n / max).toFixed(1)}%"></i></span><b>${n0(r.n)}</b></div>`).join('')}</div>`;
}

// ---------------------------------------------------------------- auth
const fails = new Map();
async function loadSession(req) {
  const tok = req.signedCookies && req.signedCookies.kk_admin;
  if (!tok) return null;
  const s = await db.one(`SELECT s.token, s.csrf, u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=$1 AND s.expires_at>NOW() AND u.active`, [tok]);
  if (!s) return null;
  req.session = { token: s.token, csrf: s.csrf };
  return s;
}
const cookieOpts = { httpOnly: true, sameSite: 'lax', signed: true, path: '/', secure: !!config.https, maxAge: 30 * 864e5 };

function loginPage(msg, st = {}) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin login</title><meta name="robots" content="noindex">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@600&family=Inter:wght@400;600;700&display=swap"><link rel="stylesheet" href="/css/admin.css?v=3"></head>
<body class="login"><form method="post" class="login-box"><img src="${esc(st.logo || '/img/logo.png')}" alt=""><h1>${esc(st.site_name_bn || 'Admin')}</h1><p>Admin Panel · অ্যাডমিন প্যানেল</p>
${msg ? `<div class="flash err">${esc(msg)}</div>` : ''}
<label>Username<input name="username" autocomplete="username" required autofocus></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label>
<button class="btn p w100">Log in</button><a href="/" class="back">← Back to website</a></form></body></html>`;
}

// ======================================================================
//  ROUTES
// ======================================================================
function register(app) {
  const r = express.Router();
  const parse = [express.urlencoded({ extended: false, limit: '2mb' }), upload.any()];

  r.get('/login', async (req, res) => { await L.ensure(); res.send(loginPage('', L.cache.settings)); });
  r.post('/login', express.urlencoded({ extended: false }), async (req, res) => {
    await L.ensure();
    const ip = req.ip, f = fails.get(ip) || { n: 0, at: Date.now() };
    if (Date.now() - f.at > 15 * 60000) { f.n = 0; f.at = Date.now(); }
    if (f.n >= 8) return res.status(429).send(loginPage('Too many attempts. Wait 15 minutes.', L.cache.settings));
    const u = await db.one('SELECT * FROM users WHERE LOWER(username)=LOWER($1) AND active', [String(req.body.username || '').trim()]);
    if (!u || !(await bcrypt.compare(String(req.body.password || ''), u.password_hash))) {
      f.n++; fails.set(ip, f);
      return res.status(401).send(loginPage('Wrong username or password.', L.cache.settings));
    }
    fails.delete(ip);
    const token = crypto.randomBytes(32).toString('hex'), csrf = crypto.randomBytes(16).toString('hex');
    await db.q(`INSERT INTO sessions(token,user_id,csrf,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '30 days')`, [token, u.id, csrf]);
    await db.q('UPDATE users SET last_login=NOW() WHERE id=$1', [u.id]);
    await db.q('INSERT INTO activity(user_id,action) VALUES($1,$2)', [u.id, 'Logged in from ' + ip]);
    res.cookie('kk_admin', token, cookieOpts);
    res.redirect(A);
  });

  // everything below needs a login
  r.use(async (req, res, next) => {
    try {
      await L.ensure();
      const u = await loadSession(req);
      if (!u) return req.method === 'GET' ? res.redirect(A + '/login') : res.status(401).send('Session expired. Please log in again.');
      req.user = u;
      res.set('Cache-Control', 'no-store');
      if (req.cookies.kk_flash) { try { req.flash = JSON.parse(req.cookies.kk_flash); } catch { /* */ } res.clearCookie('kk_flash', { path: '/' }); }
      next();
    } catch (e) { next(e); }
  });
  // CSRF check + clear public cache after every change
  r.post('/*splat', ...parse, (req, res, next) => {
    const tok = (req.body && req.body._csrf) || req.get('x-csrf');
    if (!tok || tok !== req.session.csrf) return res.status(403).send('Security check failed (CSRF). Reload the page and try again.');
    res.on('finish', () => L.invalidate());
    next();
  });
  const back = (res, url, m, t = 'ok') => { res.cookie('kk_flash', JSON.stringify({ m, t }), { path: '/', maxAge: 15000, httpOnly: true }); res.redirect(url); };
  const need = (p) => (req, res, next) => (p === '__super' ? req.user.role === 'super' : can(req.user, p)) ? next() : res.status(403).send(page(req, 'No access', `<div class="card"><p>Your account does not have access to this section. Ask the super admin.</p></div>`));

  r.post('/logout', async (req, res) => {
    await db.q('DELETE FROM sessions WHERE token=$1', [req.session.token]);
    res.clearCookie('kk_admin', { path: '/' }); res.redirect(A + '/login');
  });

  // ------------------------------------------------ dashboard
  r.get('/', async (req, res) => {
    const u = req.user;
    const k = await db.one(`SELECT
      (SELECT COUNT(*) FROM videos WHERE kind='video')::int videos, (SELECT COUNT(*) FROM videos WHERE kind='short')::int shorts,
      (SELECT COUNT(*) FROM videos WHERE demo)::int demo, (SELECT COUNT(*) FROM videos WHERE status='draft' OR published_at>NOW())::int pending,
      (SELECT COUNT(*) FROM subscribers)::int subs, (SELECT COUNT(*) FROM messages WHERE NOT is_read)::int unread,
      (SELECT COUNT(*) FROM ads WHERE active AND (ends_at IS NULL OR ends_at>NOW()))::int ads`);
    const today = await db.one(`SELECT COUNT(*) FILTER (WHERE type='pageview')::int pv, COUNT(DISTINCT visitor) FILTER (WHERE type='pageview')::int uv,
      COUNT(*) FILTER (WHERE type='play')::int plays FROM events WHERE ts >= (date_trunc('day', NOW() AT TIME ZONE 'Asia/Dhaka') AT TIME ZONE 'Asia/Dhaka')`);
    const live = await db.one(`SELECT COUNT(DISTINCT visitor)::int n FROM events WHERE ts > NOW()-INTERVAL '5 minutes'`);
    const days = await db.all(`SELECT to_char(d,'DD Mon') AS lbl, COALESCE(x.n,0)::int n FROM generate_series((NOW() AT TIME ZONE 'Asia/Dhaka')::date - 13, (NOW() AT TIME ZONE 'Asia/Dhaka')::date, '1 day') d
      LEFT JOIN (SELECT (ts AT TIME ZONE 'Asia/Dhaka')::date dd, COUNT(*) n FROM events WHERE type='pageview' AND ts > NOW()-INTERVAL '15 days' GROUP BY 1) x ON x.dd=d::date ORDER BY d`);
    const top = await db.all(`SELECT v.id, v.title_en, v.title_bn, v.yt_id, COUNT(*)::int n FROM events e JOIN videos v ON v.id=e.video_id WHERE e.type='play' AND e.ts>NOW()-INTERVAL '7 days' GROUP BY v.id ORDER BY n DESC LIMIT 6`);
    const recent = await db.all(`SELECT id,title_en,title_bn,yt_id,kind,thumb_url,published_at,status FROM videos ORDER BY created_at DESC LIMIT 6`);
    const defaultPw = u.role === 'super' && u.username === config.defaultAdmin.username && await bcrypt.compare(config.defaultAdmin.password, u.password_hash);
    const showAn = can(u, 'analytics');
    const body = `
${defaultPw ? `<div class="flash warn">⚠ You are still using the default password. <a href="${A}/account">Change it now →</a></div>` : ''}
${k.demo && u.role === 'super' ? `<div class="flash info">The site contains <b>${k.demo}</b> demo items (sample video link). Add your own videos, then <form method="post" action="${A}/demo/remove" class="inline" onsubmit="return confirm('Delete all demo videos and the demo series?')"><input type="hidden" name="_csrf" value="${esc(req.session.csrf)}"><button class="lnk">remove demo content</button></form>.</div>` : ''}
${can(u, 'videos') ? `<form class="card quick" method="get" action="${A}/videos/new"><b>${ic('play')} Quick add</b><input name="url" placeholder="Paste a YouTube link and press Enter…" required><button class="btn p">Add video</button><a class="btn" href="${A}/videos/bulk">Bulk add</a></form>` : ''}
<div class="kpis">
${showAn ? `<div class="kpi"><small>Visitors today</small><b>${n0(today.uv)}</b><span>${n0(live.n)} online now</span></div><div class="kpi"><small>Page views today</small><b>${n0(today.pv)}</b></div><div class="kpi"><small>Video plays today</small><b>${n0(today.plays)}</b></div>` : ''}
<div class="kpi"><small>Videos</small><b>${n0(k.videos)}</b><span>${n0(k.shorts)} shorts${k.pending ? ` · ${k.pending} draft/scheduled` : ''}</span></div>
${can(u, 'ads') ? `<div class="kpi"><small>Active ads</small><b>${n0(k.ads)}</b></div>` : ''}
${can(u, 'subscribers') ? `<div class="kpi"><small>Subscribers</small><b>${n0(k.subs)}</b></div>` : ''}
${can(u, 'messages') ? `<a class="kpi" href="${A}/messages"><small>Unread messages</small><b>${n0(k.unread)}</b></a>` : ''}
</div>
<div class="cols">
${showAn ? `<div class="card wide"><div class="card-h"><h2>Page views — last 14 days</h2><a href="${A}/analytics">Full analytics →</a></div>${barChart(days.map((d) => d.n), days.map((d) => d.lbl), { unit: 'views', title: 'Page views per day' })}</div>
<div class="card"><div class="card-h"><h2>Most played (7 days)</h2></div>${top.length ? `<ol class="toplist">${top.map((v) => `<li><img src="https://i.ytimg.com/vi/${esc(v.yt_id)}/default.jpg" alt=""><a href="${A}/videos/${v.id}">${esc(v.title_en || v.title_bn)}</a><b>${n0(v.n)}</b></li>`).join('')}</ol>` : '<p class="muted">No plays recorded yet.</p>'}</div>` : ''}
${can(u, 'videos') ? `<div class="card"><div class="card-h"><h2>Recently added</h2><a href="${A}/videos">All videos →</a></div><ol class="toplist">${recent.map((v) => `<li><img src="${esc(v.thumb_url || `https://i.ytimg.com/vi/${v.yt_id}/default.jpg`)}" alt=""><a href="${A}/videos/${v.id}">${esc(v.title_en || v.title_bn)}</a><small>${v.status === 'draft' ? 'draft' : ago(v.published_at)}</small></li>`).join('')}</ol></div>` : ''}
</div>`;
    res.send(page(req, 'Dashboard', body, { cur: '' }));
  });

  r.post('/demo/remove', need('__super'), async (req, res) => {
    await db.q('DELETE FROM videos WHERE demo'); await db.q('DELETE FROM series WHERE demo');
    await log(req, 'Removed demo content');
    back(res, A, 'Demo content removed.');
  });

  // ------------------------------------------------ analytics
  r.get('/analytics', need('analytics'), async (req, res) => {
    const days = [1, 7, 30, 90, 365].includes(+req.query.d) ? +req.query.d : 7;
    const since = `((date_trunc('day', NOW() AT TIME ZONE 'Asia/Dhaka') - INTERVAL '${days - 1} days') AT TIME ZONE 'Asia/Dhaka')`;
    const W = `ts >= ${since}`;
    const [k, prev, live, daily, hourly, pages, vids, refs, dev, br, os, lang, ads] = await Promise.all([
      db.one(`SELECT COUNT(*) FILTER (WHERE type='pageview')::int pv, COUNT(DISTINCT visitor) FILTER (WHERE type='pageview')::int uv, COUNT(*) FILTER (WHERE type='play')::int plays,
        COUNT(*) FILTER (WHERE type='ad_view')::int adv, COUNT(*) FILTER (WHERE type='ad_click')::int adc, COUNT(*) FILTER (WHERE type='share')::int sh FROM events WHERE ${W}`),
      db.one(`SELECT COUNT(*) FILTER (WHERE type='pageview')::int pv, COUNT(DISTINCT visitor) FILTER (WHERE type='pageview')::int uv, COUNT(*) FILTER (WHERE type='play')::int plays FROM events
        WHERE ts >= ${since} - INTERVAL '${days} days' AND ts < ${since}`),
      db.one(`SELECT COUNT(DISTINCT visitor)::int n FROM events WHERE ts > NOW()-INTERVAL '5 minutes'`),
      db.all(`SELECT to_char(d,'DD Mon') AS lbl, COALESCE(x.pv,0)::int pv, COALESCE(x.uv,0)::int uv, COALESCE(x.pl,0)::int pl FROM generate_series((NOW() AT TIME ZONE 'Asia/Dhaka')::date - ${Math.max(days, 7) - 1}, (NOW() AT TIME ZONE 'Asia/Dhaka')::date, '1 day') d
        LEFT JOIN (SELECT (ts AT TIME ZONE 'Asia/Dhaka')::date dd, COUNT(*) FILTER (WHERE type='pageview') pv, COUNT(DISTINCT visitor) FILTER (WHERE type='pageview') uv, COUNT(*) FILTER (WHERE type='play') pl
        FROM events WHERE ts > NOW() - INTERVAL '${Math.max(days, 7) + 1} days' GROUP BY 1) x ON x.dd=d::date ORDER BY d`),
      db.all(`SELECT h, COALESCE(x.n,0)::int n FROM generate_series(0,23) h LEFT JOIN (SELECT EXTRACT(HOUR FROM ts AT TIME ZONE 'Asia/Dhaka')::int hr, COUNT(*) n FROM events WHERE type='pageview' AND ${W} GROUP BY 1) x ON x.hr=h ORDER BY h`),
      db.all(`SELECT path label, COUNT(*)::int n FROM events WHERE type='pageview' AND ${W} GROUP BY path ORDER BY n DESC LIMIT 12`),
      db.all(`SELECT v.id, COALESCE(NULLIF(v.title_en,''),v.title_bn) label, COUNT(*)::int n FROM events e JOIN videos v ON v.id=e.video_id WHERE e.type='play' AND e.${W} GROUP BY v.id ORDER BY n DESC LIMIT 12`),
      db.all(`SELECT referrer label, COUNT(*)::int n FROM events WHERE type='pageview' AND referrer<>'' AND ${W} GROUP BY referrer ORDER BY n DESC LIMIT 12`),
      db.all(`SELECT device label, COUNT(DISTINCT visitor)::int n FROM events WHERE type='pageview' AND ${W} GROUP BY 1 ORDER BY n DESC`),
      db.all(`SELECT browser label, COUNT(DISTINCT visitor)::int n FROM events WHERE type='pageview' AND ${W} GROUP BY 1 ORDER BY n DESC`),
      db.all(`SELECT os label, COUNT(DISTINCT visitor)::int n FROM events WHERE type='pageview' AND ${W} GROUP BY 1 ORDER BY n DESC`),
      db.all(`SELECT CASE lang WHEN 'bn' THEN 'বাংলা' WHEN 'en' THEN 'English' ELSE lang END label, COUNT(*)::int n FROM events WHERE type='pageview' AND ${W} GROUP BY 1 ORDER BY n DESC`),
      db.all(`SELECT a.name label, COUNT(*) FILTER (WHERE e.type='ad_view')::int v, COUNT(*) FILTER (WHERE e.type='ad_click')::int c FROM events e JOIN ads a ON a.id=e.ad_id WHERE e.type IN ('ad_view','ad_click') AND e.${W} GROUP BY a.id ORDER BY v DESC LIMIT 10`)
    ]);
    const delta = (a, b) => b ? `<span class="${a >= b ? 'up' : 'down'}">${a >= b ? '▲' : '▼'} ${Math.abs(Math.round(100 * (a - b) / b))}%</span>` : '<span class="muted">—</span>';
    const dl = daily.map((d) => d.lbl);
    const st = L.cache.settings;
    const body = `<div class="tabs">${[[1, 'Today'], [7, '7 days'], [30, '30 days'], [90, '90 days'], [365, '1 year']].map(([d, l]) => `<a href="?d=${d}" class="${d === days ? 'on' : ''}">${l}</a>`).join('')}
<span class="live"><i></i>${n0(live.n)} visitors online now</span></div>
${st.self_analytics !== '1' ? `<div class="flash warn">Built-in analytics is turned off in Settings → Analytics & Tracking.</div>` : ''}
<div class="kpis">
<div class="kpi"><small>Unique visitors</small><b>${n0(k.uv)}</b>${delta(k.uv, prev.uv)}</div>
<div class="kpi"><small>Page views</small><b>${n0(k.pv)}</b>${delta(k.pv, prev.pv)}</div>
<div class="kpi"><small>Video plays</small><b>${n0(k.plays)}</b>${delta(k.plays, prev.plays)}</div>
<div class="kpi"><small>Pages / visitor</small><b>${k.uv ? (k.pv / k.uv).toFixed(1) : '0'}</b></div>
<div class="kpi"><small>Ad views · clicks</small><b>${n0(k.adv)} · ${n0(k.adc)}</b><span>CTR ${k.adv ? (100 * k.adc / k.adv).toFixed(2) : '0'}%</span></div>
<div class="kpi"><small>Shares</small><b>${n0(k.sh)}</b></div></div>
<div class="cols c2">
<div class="card"><div class="card-h"><h2>Visitors per day</h2></div>${barChart(daily.map((d) => d.uv), dl, { unit: 'visitors', title: 'Visitors per day' })}</div>
<div class="card"><div class="card-h"><h2>Video plays per day</h2></div>${barChart(daily.map((d) => d.pl), dl, { unit: 'plays', title: 'Plays per day' })}</div>
<div class="card"><div class="card-h"><h2>Top videos (plays)</h2></div>${hbars(vids.map((v) => ({ ...v, href: '/v/' + v.id })), { link: true })}</div>
<div class="card"><div class="card-h"><h2>Top pages</h2></div>${hbars(pages.map((p) => ({ ...p, href: p.label })), { link: true })}</div>
<div class="card"><div class="card-h"><h2>Traffic sources (referrers)</h2></div>${hbars(refs)}<p class="muted sm">Direct visits / apps without a referrer are not listed.</p></div>
<div class="card"><div class="card-h"><h2>Busy hours (Bangladesh time)</h2></div>${barChart(hourly.map((h) => h.n), hourly.map((h) => String(h.h).padStart(2, '0')), { unit: 'views', h: 160, title: 'Views by hour' })}</div>
<div class="card"><div class="card-h"><h2>Devices</h2></div>${hbars(dev)}<h3 class="sub">Language</h3>${hbars(lang)}</div>
<div class="card"><div class="card-h"><h2>Browsers & systems</h2></div>${hbars(br)}<h3 class="sub">Operating system</h3>${hbars(os)}</div>
<div class="card"><div class="card-h"><h2>Ad performance</h2></div>${ads.length ? `<table class="tbl"><tr><th>Ad</th><th>Views</th><th>Clicks</th><th>CTR</th></tr>${ads.map((a) => `<tr><td>${esc(a.label)}</td><td>${n0(a.v)}</td><td>${n0(a.c)}</td><td>${a.v ? (100 * a.c / a.v).toFixed(2) + '%' : '—'}</td></tr>`).join('')}</table>` : '<p class="muted">No ad activity in this period.</p>'}</div>
<div class="card"><div class="card-h"><h2>External tracking</h2></div><ul class="checks"><li class="${st.ga_id ? 'ok' : ''}">Google Analytics 4: ${st.ga_id ? esc(st.ga_id) : 'not set'}</li><li class="${st.pixel_id ? 'ok' : ''}">Meta Pixel: ${st.pixel_id ? esc(st.pixel_id) : 'not set'}</li></ul>${can(req.user, 'settings') ? `<a class="btn" href="${A}/settings#tracking">Edit tracking IDs</a>` : ''}</div>
</div>`;
    res.send(page(req, 'Analytics', body, { cur: '/analytics' }));
  });

  // ------------------------------------------------ videos
  r.get('/videos', need('videos'), async (req, res) => {
    const q = String(req.query.q || '').trim(), kind = req.query.kind || '', cat = parseInt(req.query.cat) || 0, st = req.query.status || '';
    const per = 30, pg = Math.max(1, parseInt(req.query.page) || 1);
    const w = [], p = [];
    if (q) { p.push('%' + q + '%'); w.push(`(v.title_bn ILIKE $${p.length} OR v.title_en ILIKE $${p.length} OR v.yt_id ILIKE $${p.length})`); }
    if (kind === 'video' || kind === 'short') { p.push(kind); w.push(`v.kind=$${p.length}`); }
    if (cat) { p.push(cat); w.push(`v.category_id=$${p.length}`); }
    if (st === 'draft') w.push(`(v.status='draft' OR v.published_at>NOW())`);
    if (st === 'featured') w.push('v.is_featured');
    const where = w.length ? 'WHERE ' + w.join(' AND ') : '';
    const total = (await db.one(`SELECT COUNT(*)::int n FROM videos v ${where}`, p)).n;
    const rows = await db.all(`SELECT v.*, c.name_en cat FROM videos v LEFT JOIN categories c ON c.id=v.category_id ${where} ORDER BY v.published_at DESC LIMIT ${per} OFFSET ${(pg - 1) * per}`, p);
    const cats = await db.all('SELECT id,name_en FROM categories ORDER BY sort,id');
    const hero = (L.cache.settings.hero_mode === 'featured' && (await db.one(`SELECT id FROM videos WHERE is_featured AND kind='video' AND status='published' AND published_at<=NOW() ORDER BY published_at DESC LIMIT 1`)))
      || await db.one(`SELECT id FROM videos WHERE kind='video' AND status='published' AND published_at<=NOW() ORDER BY published_at DESC LIMIT 1`);
    const csrf = esc(req.session.csrf);
    const qsBase = new URLSearchParams({ q, kind, cat: cat || '', status: st }).toString();
    const pages = Math.ceil(total / per);
    const body = `<form class="filters" method="get"><div class="srch">${ic('search')}<input name="q" value="${esc(q)}" placeholder="Search title or YouTube ID"></div>
<select name="kind"><option value="">All types</option><option value="video" ${kind === 'video' ? 'selected' : ''}>Videos</option><option value="short" ${kind === 'short' ? 'selected' : ''}>Shorts</option></select>
<select name="cat"><option value="">All categories</option>${cats.map((c) => `<option value="${c.id}" ${cat === c.id ? 'selected' : ''}>${esc(c.name_en)}</option>`).join('')}</select>
<select name="status"><option value="">Any status</option><option value="featured" ${st === 'featured' ? 'selected' : ''}>★ Featured</option><option value="draft" ${st === 'draft' ? 'selected' : ''}>Draft / scheduled</option></select>
<button class="btn">Filter</button><span class="muted">${n0(total)} found</span></form>
<form method="post" action="${A}/videos/bulk-delete" id="bulkForm" onsubmit="return confirm('Delete the selected videos?')"><input type="hidden" name="_csrf" value="${csrf}">
<div class="card flush"><table class="tbl vids"><thead><tr><th><input type="checkbox" onclick="document.querySelectorAll('.rowchk').forEach(c=>c.checked=this.checked)"></th><th></th><th>Title</th><th>Category</th><th>Plays</th><th>Published</th><th></th></tr></thead><tbody>
${rows.map((v) => {
      const scheduled = v.status === 'published' && new Date(v.published_at) > new Date();
      return `<tr><td><input type="checkbox" class="rowchk" name="ids" value="${v.id}"></td>
<td><a href="${A}/videos/${v.id}" class="vt ${v.kind === 'short' ? 's' : ''}"><img loading="lazy" src="${esc(v.thumb_url || `https://i.ytimg.com/vi/${v.yt_id}/mqdefault.jpg`)}" alt=""></a></td>
<td><a href="${A}/videos/${v.id}" class="ttl">${esc(v.title_bn || v.title_en)}</a><small>${esc(v.title_en)}</small>
<div class="tags">${hero && hero.id === v.id ? '<span class="pill ok">Main video now</span>' : ''}${v.kind === 'short' ? '<span class="pill">Short</span>' : ''}${v.status === 'draft' ? '<span class="pill">Draft</span>' : ''}${scheduled ? '<span class="pill warn">Scheduled</span>' : ''}${v.series_id ? `<span class="pill">Ep ${v.episode || '?'}</span>` : ''}${v.play_mode !== 'inherit' ? `<span class="pill">${esc(v.play_mode)}</span>` : ''}${v.demo ? '<span class="pill">demo</span>' : ''}</div></td>
<td>${esc(v.cat || '—')}</td><td>${n0(v.plays)}</td><td><small>${fmtDate(v.published_at)}</small></td>
<td class="acts"><button type="button" class="icon star ${v.is_featured ? 'on' : ''}" title="Featured" data-toggle="${A}/videos/${v.id}/feature">${ic(v.is_featured ? 'star' : 'starO')}</button>
<a class="icon" href="/v/${v.id}" target="_blank" title="View">${ic('eye')}</a><a class="icon" href="${A}/videos/${v.id}" title="Edit">${ic('edit')}</a>
<button type="button" class="icon danger" title="Delete" data-del="${A}/videos/${v.id}/delete">${ic('del')}</button></td></tr>`;
    }).join('') || '<tr><td colspan="7" class="muted center">No videos found.</td></tr>'}
</tbody></table></div>
<div class="bar-b"><button class="btn danger sm">Delete selected</button>${pages > 1 ? `<div class="pager">${Array.from({ length: pages }, (_, i) => i + 1).filter((i) => Math.abs(i - pg) < 4 || i === 1 || i === pages).map((i) => i === pg ? `<span>${i}</span>` : `<a href="?${qsBase}&page=${i}">${i}</a>`).join('')}</div>` : ''}</div></form>`;
    res.send(page(req, 'Videos & Shorts', body, { cur: '/videos', actions: `<a class="btn" href="${A}/videos/bulk">Bulk add</a><a class="btn p" href="${A}/videos/new">${ic('plus')}Add video</a>` }));
  });

  r.get('/videos/bulk', need('videos'), async (req, res) => {
    const body = `<form method="post" class="card form"><input type="hidden" name="_csrf" value="${esc(req.session.csrf)}">
<p class="muted">Paste many YouTube links — one per line. Titles are fetched from YouTube automatically (you can translate them later). Shorts links are detected automatically.</p>
<div class="fld"><label>YouTube links</label><textarea name="links" rows="10" class="mono" required placeholder="https://www.youtube.com/watch?v=...&#10;https://youtu.be/...&#10;https://www.youtube.com/shorts/..."></textarea></div>
${fieldsHTML([{ name: 'category_id', label: 'Category for all', type: 'select', options: await catOptions(), half: true }, { name: 'status', label: 'Status', type: 'select', options: [['published', 'Published'], ['draft', 'Draft']], half: true }])}
<div class="form-b"><button class="btn p">Add all</button></div></form>`;
    res.send(page(req, 'Bulk add videos', body, { cur: '/videos' }));
  });
  r.post('/videos/bulk', need('videos'), async (req, res) => {
    const lines = String(req.body.links || '').split(/\s+/).filter(Boolean).slice(0, 100);
    let ok = 0, bad = 0; const key = L.cache.settings.yt_api_key;
    let i = 0;
    for (const line of lines) {
      const y = L.parseYouTube(line); if (!y) { bad++; continue; }
      const [oe, det] = await Promise.all([L.ytOEmbed(y.id), L.ytDetails(y.id, key)]);
      const title = (oe && oe.title) || (det && det.title) || y.id;
      const isShort = y.short || (det && det.seconds && det.seconds <= 180 && oe && oe.height > oe.width);
      // keep the order: first line = newest
      await db.q(`INSERT INTO videos(yt_id,yt_url,kind,title_bn,title_en,category_id,status,duration,yt_views,created_by,published_at) VALUES($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,NOW() - ($10 || ' seconds')::interval)`,
        [y.id, line, isShort ? 'short' : 'video', title, parseInt(req.body.category_id) || null, req.body.status === 'draft' ? 'draft' : 'published', det ? det.duration : '', det ? det.views : 0, req.user.id, String(i++)]);
      ok++;
    }
    await log(req, `Bulk added ${ok} videos`);
    back(res, A + '/videos', `${ok} video(s) added${bad ? `, ${bad} invalid link(s) skipped` : ''}.`, bad ? 'warn' : 'ok');
  });

  async function videoForm(req, res, v) {
    const fields = await videoFields();
    const row = v || { kind: 'video', status: 'published', play_mode: 'inherit', yt_url: req.query.url || '' };
    if (!v && req.query.url) { const y = L.parseYouTube(req.query.url); if (y && y.short) row.kind = 'short'; }
    const yt = row.yt_id || (L.parseYouTube(row.yt_url) || {}).id || '';
    const body = `<form method="post" action="${A}/videos/save" enctype="multipart/form-data" class="card form vform" id="vform">
<input type="hidden" name="_csrf" value="${esc(req.session.csrf)}"><input type="hidden" name="id" value="${v ? v.id : ''}">
<div class="ytbox"><div class="ytprev" id="ytPrev">${yt ? `<img src="https://i.ytimg.com/vi/${esc(yt)}/hqdefault.jpg" alt="">` : '<span>Preview</span>'}</div>
<div class="ytfields">${fieldsHTML(fields.slice(0, 4), row)}<div class="ytbtns"><button type="button" class="btn" id="ytFetch">${ic('search')} Fetch info from YouTube</button><span id="ytMsg" class="muted"></span></div></div></div>
${fieldsHTML(fields.slice(4), row)}
<div class="form-b">${v ? `<a class="btn" href="/v/${v.id}" target="_blank">${ic('eye')}View on site</a><button type="button" class="btn danger" data-del="${A}/videos/${v.id}/delete">${ic('del')}Delete</button>` : ''}<span class="grow"></span><a class="btn" href="${A}/videos">Cancel</a><button class="btn p">${v ? 'Save changes' : 'Publish video'}</button></div></form>`;
    res.send(page(req, v ? 'Edit video' : 'Add video', body, { cur: v ? '/videos' : '/videos/new' }));
  }
  r.get('/videos/new', need('videos'), (req, res) => videoForm(req, res, null));
  r.get('/videos/:id', need('videos'), async (req, res, next) => {
    const v = await db.one('SELECT * FROM videos WHERE id=$1', [parseInt(req.params.id) || 0]);
    if (!v) return next();
    videoForm(req, res, v);
  });
  r.post('/videos/save', need('videos'), async (req, res) => {
    const fields = flatFields(await videoFields());
    const d = {}; for (const fd of fields) d[fd.name] = readValue(fd, req);
    const y = L.parseYouTube(d.yt_url);
    if (!y) return back(res, req.get('referer') || A + '/videos/new', 'That is not a valid YouTube link.', 'err');
    if (!d.title_bn && !d.title_en) return back(res, req.get('referer') || A + '/videos/new', 'Please write a title (Bangla or English).', 'err');
    d.yt_id = y.id;
    if (y.short) d.kind = 'short';
    if (!['video', 'short'].includes(d.kind)) d.kind = 'video';
    if (!['inherit', 'inline', 'page', 'youtube'].includes(d.play_mode)) d.play_mode = 'inherit';
    if (!['published', 'draft'].includes(d.status)) d.status = 'published';
    if (!d.published_at) d.published_at = new Date();
    d.updated_at = new Date();
    const id = parseInt(req.body.id);
    const keys = Object.keys(d);
    if (id) {
      await db.q(`UPDATE videos SET ${keys.map((k, i) => `${k}=$${i + 1}`).join(',')}, demo=FALSE WHERE id=$${keys.length + 1}`, [...keys.map((k) => d[k]), id]);
      await log(req, `Edited video #${id}: ${d.title_en || d.title_bn}`);
      return back(res, A + '/videos/' + id, 'Video saved.');
    }
    d.created_by = req.user.id;
    const ks = Object.keys(d);
    const row = await db.one(`INSERT INTO videos(${ks.join(',')}) VALUES(${ks.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING id`, ks.map((k) => d[k]));
    await log(req, `Added video #${row.id}: ${d.title_en || d.title_bn}`);
    back(res, A + '/videos', 'Video published. ' + (d.published_at > new Date() ? 'It will appear at the scheduled time.' : 'It is live on the site now.'));
  });
  r.post('/videos/:id/delete', need('videos'), async (req, res) => {
    const v = await db.one('DELETE FROM videos WHERE id=$1 RETURNING title_en,title_bn', [parseInt(req.params.id) || 0]);
    if (v) await log(req, `Deleted video: ${v.title_en || v.title_bn}`);
    back(res, A + '/videos', 'Video deleted.');
  });
  r.post('/videos/bulk-delete', need('videos'), async (req, res) => {
    const ids = [].concat(req.body.ids || []).map(Number).filter(Boolean);
    if (ids.length) { await db.q('DELETE FROM videos WHERE id = ANY($1)', [ids]); await log(req, `Deleted ${ids.length} videos`); }
    back(res, A + '/videos', `${ids.length} video(s) deleted.`);
  });
  r.post('/videos/:id/feature', need('videos'), async (req, res) => {
    const v = await db.one('UPDATE videos SET is_featured=NOT is_featured WHERE id=$1 RETURNING is_featured', [parseInt(req.params.id) || 0]);
    res.json({ ok: !!v, on: v && v.is_featured });
  });
  r.get('/api/yt', need('videos'), async (req, res) => {
    const y = L.parseYouTube(req.query.url);
    if (!y) return res.json({ ok: false, error: 'Not a valid YouTube link' });
    const [oe, det] = await Promise.all([L.ytOEmbed(y.id), L.ytDetails(y.id, L.cache.settings.yt_api_key)]);
    const exists = await db.one('SELECT id FROM videos WHERE yt_id=$1 LIMIT 1', [y.id]);
    res.json({ ok: true, id: y.id, short: y.short, title: (oe && oe.title) || (det && det.title) || '', author: oe && oe.author_name, duration: det ? det.duration : '', views: det ? det.views : 0, description: det ? String(det.description || '').split('\n')[0].slice(0, 300) : '', exists: exists && exists.id, hasKey: !!L.cache.settings.yt_api_key });
  });

  // ------------------------------------------------ generic resources
  const getFields = async (R) => (typeof R.fields === 'function' ? await R.fields() : R.fields);
  r.get('/r/:res', async (req, res, next) => {
    const R = RES[req.params.res]; if (!R) return next();
    if (!can(req.user, R.perm)) return need(R.perm)(req, res, next);
    const rows = await db.all(R.listSql || `SELECT * FROM ${R.table} ORDER BY ${R.order}`);
    const cell = (row, [key, , fn]) => fn ? fn(row) : typeof row[key] === 'boolean' ? (row[key] ? '<span class="pill ok">Yes</span>' : '<span class="pill">No</span>') : esc(row[key] == null ? '—' : row[key]);
    const body = `${R.intro ? `<p class="intro">${R.intro}</p>` : ''}<div class="card flush"><table class="tbl"><thead><tr>${R.list.map(([, l]) => `<th>${esc(l)}</th>`).join('')}<th></th></tr></thead><tbody>
${rows.map((row) => `<tr>${R.list.map((c, i) => `<td>${i === 0 ? `<a href="${A}/r/${req.params.res}/${row.id}" class="ttl">${cell(row, c)}</a>` : cell(row, c)}</td>`).join('')}
<td class="acts"><a class="icon" href="${A}/r/${req.params.res}/${row.id}" title="Edit">${ic('edit')}</a><button type="button" class="icon danger" data-del="${A}/r/${req.params.res}/${row.id}/delete" title="Delete">${ic('del')}</button></td></tr>`).join('') || `<tr><td colspan="${R.list.length + 1}" class="muted center">Nothing here yet.</td></tr>`}
</tbody></table></div>`;
    res.send(page(req, R.title, body, { cur: '/r/' + req.params.res, actions: `<a class="btn p" href="${A}/r/${req.params.res}/new">${ic('plus')}Add ${esc(R.single)}</a>` }));
  });
  r.get('/r/:res/:id', async (req, res, next) => {
    const R = RES[req.params.res]; if (!R) return next();
    if (!can(req.user, R.perm)) return need(R.perm)(req, res, next);
    const isNew = req.params.id === 'new';
    const row = isNew ? {} : await db.one(`SELECT * FROM ${R.table} WHERE id=$1`, [parseInt(req.params.id) || 0]);
    if (!row) return next();
    const fields = await getFields(R);
    const body = `<form method="post" action="${A}/r/${req.params.res}/save" enctype="multipart/form-data" class="card form">
<input type="hidden" name="_csrf" value="${esc(req.session.csrf)}"><input type="hidden" name="id" value="${isNew ? '' : row.id}">
${fieldsHTML(fields, row)}
<div class="form-b">${isNew ? '' : `<button type="button" class="btn danger" data-del="${A}/r/${req.params.res}/${row.id}/delete">${ic('del')}Delete</button>`}<span class="grow"></span><a class="btn" href="${A}/r/${req.params.res}">Cancel</a><button class="btn p">Save</button></div></form>`;
    res.send(page(req, (isNew ? 'Add ' : 'Edit ') + R.single, body, { cur: '/r/' + req.params.res }));
  });
  r.post('/r/:res/save', async (req, res, next) => {
    const R = RES[req.params.res]; if (!R) return next();
    if (!can(req.user, R.perm)) return need(R.perm)(req, res, next);
    const fields = flatFields(await getFields(R));
    const d = {}; for (const fd of fields) d[fd.name] = readValue(fd, req);
    if (R.before) R.before(d);
    const id = parseInt(req.body.id);
    const keys = Object.keys(d);
    try {
      if (id) await db.q(`UPDATE ${R.table} SET ${keys.map((k, i) => `${k}=$${i + 1}`).join(',')} WHERE id=$${keys.length + 1}`, [...keys.map((k) => d[k]), id]);
      else await db.q(`INSERT INTO ${R.table}(${keys.join(',')}) VALUES(${keys.map((_, i) => '$' + (i + 1)).join(',')})`, keys.map((k) => d[k]));
    } catch (e) {
      if (e.code === '23505') return back(res, req.get('referer'), 'That URL slug is already used. Choose another.', 'err');
      throw e;
    }
    await log(req, `${id ? 'Edited' : 'Added'} ${R.single}: ${d.name_en || d.title_en || d.label_en || d.name || d.text_en || d.slug || ''}`);
    back(res, A + '/r/' + req.params.res, `${R.single} saved.`);
  });
  r.post('/r/:res/:id/delete', async (req, res, next) => {
    const R = RES[req.params.res]; if (!R) return next();
    if (!can(req.user, R.perm)) return need(R.perm)(req, res, next);
    await db.q(`DELETE FROM ${R.table} WHERE id=$1`, [parseInt(req.params.id) || 0]);
    await log(req, `Deleted ${R.single} #${req.params.id}`);
    back(res, A + '/r/' + req.params.res, `${R.single} deleted.`);
  });

  // ------------------------------------------------ settings
  r.get('/settings', need('settings'), async (req, res) => {
    const st = L.cache.settings;
    const body = `<div class="tabs sticky">${SETTINGS.map((g) => `<a href="#${g.id}">${esc(g.title)}</a>`).join('')}</div>
<form method="post" enctype="multipart/form-data" class="settings"><input type="hidden" name="_csrf" value="${esc(req.session.csrf)}">
${SETTINGS.map((g) => `<section class="card form" id="${g.id}"><h2>${esc(g.title)}</h2>${fieldsHTML(g.fields, st)}</section>`).join('')}
<div class="savebar"><span class="muted">Changes appear on the website immediately.</span><button class="btn p">Save all settings</button></div></form>`;
    res.send(page(req, 'Site Settings', body, { cur: '/settings' }));
  });
  r.post('/settings', need('settings'), async (req, res) => {
    const all = flatFields(SETTINGS.flatMap((g) => g.fields));
    for (const fd of all) {
      if (!(fd.name in req.body) && !(req.files || []).some((x) => x.fieldname === fd.name + '__file')) continue;
      let v = readValue(fd, req);
      if (fd.type === 'bool') v = v ? '1' : '0';
      if (fd.type === 'color' && !/^#[0-9a-f]{6}$/i.test(v)) continue;
      await db.q('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value', [fd.name, String(v ?? '')]);
    }
    await log(req, 'Updated site settings');
    back(res, A + '/settings', 'Settings saved.');
  });

  // ------------------------------------------------ labels
  r.get('/labels', need('labels'), async (req, res) => {
    const L2 = L.cache.labels;
    const body = `<p class="intro">Every small text on the website (buttons, headings, messages). Change any of them in both languages. Use {a} and {b} where shown.</p>
<form method="post" class="card flush"><input type="hidden" name="_csrf" value="${esc(req.session.csrf)}"><table class="tbl labels"><thead><tr><th>Key</th><th>বাংলা</th><th>English</th></tr></thead><tbody>
${Object.keys(L.DEFAULT_LABELS).map((k) => `<tr><td><code>${k}</code></td><td><input name="bn__${k}" value="${esc(L2[k].bn)}"></td><td><input name="en__${k}" value="${esc(L2[k].en)}"></td></tr>`).join('')}
</tbody></table><div class="form-b pad"><span class="grow"></span><button class="btn p">Save labels</button></div></form>`;
    res.send(page(req, 'Text Labels', body, { cur: '/labels' }));
  });
  r.post('/labels', need('labels'), async (req, res) => {
    for (const k of Object.keys(L.DEFAULT_LABELS)) {
      const bn = String(req.body['bn__' + k] || '').trim(), en = String(req.body['en__' + k] || '').trim();
      await db.q('INSERT INTO labels(key,bn,en) VALUES($1,$2,$3) ON CONFLICT (key) DO UPDATE SET bn=EXCLUDED.bn, en=EXCLUDED.en', [k, bn, en]);
    }
    await log(req, 'Updated text labels');
    back(res, A + '/labels', 'Labels saved.');
  });

  // ------------------------------------------------ subscribers
  r.get('/subscribers', need('subscribers'), async (req, res) => {
    const rows = await db.all('SELECT * FROM subscribers ORDER BY created_at DESC LIMIT 1000');
    const body = `<div class="card flush"><table class="tbl"><thead><tr><th>Email</th><th>Language</th><th>Date</th><th></th></tr></thead><tbody>
${rows.map((s) => `<tr><td>${esc(s.email)}</td><td>${s.lang === 'bn' ? 'বাংলা' : 'English'}</td><td>${fmtDate(s.created_at)}</td><td class="acts"><button type="button" class="icon danger" data-del="${A}/subscribers/${s.id}/delete">${ic('del')}</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted center">No subscribers yet.</td></tr>'}
</tbody></table></div>`;
    res.send(page(req, `Subscribers (${rows.length})`, body, { cur: '/subscribers', actions: `<a class="btn" href="${A}/subscribers.csv">${ic('dl')}Download CSV</a>` }));
  });
  r.get('/subscribers.csv', need('subscribers'), async (req, res) => {
    const rows = await db.all('SELECT email,lang,created_at FROM subscribers ORDER BY created_at DESC');
    res.set('Content-Disposition', 'attachment; filename="subscribers.csv"').type('text/csv')
      .send('﻿email,language,date\n' + rows.map((s) => `"${s.email.replace(/"/g, '""')}",${s.lang},${new Date(s.created_at).toISOString()}`).join('\n'));
  });
  r.post('/subscribers/:id/delete', need('subscribers'), async (req, res) => {
    await db.q('DELETE FROM subscribers WHERE id=$1', [parseInt(req.params.id) || 0]);
    back(res, A + '/subscribers', 'Subscriber removed.');
  });

  // ------------------------------------------------ messages
  r.get('/messages', need('messages'), async (req, res) => {
    const rows = await db.all('SELECT * FROM messages ORDER BY created_at DESC LIMIT 500');
    const csrf = esc(req.session.csrf);
    const body = rows.length ? rows.map((m) => `<div class="card msg ${m.is_read ? '' : 'unread'}"><div class="card-h"><div><b>${esc(m.name)}</b> <span class="muted">${esc(m.email)} ${esc(m.phone)}</span></div><small class="muted">${fmtDate(m.created_at)}</small></div>
<p>${esc(m.body).replace(/\n/g, '<br>')}</p><div class="form-b">${m.email ? `<a class="btn sm" href="mailto:${esc(m.email)}">Reply by email</a>` : ''}
${m.is_read ? '' : `<form method="post" action="${A}/messages/${m.id}/read" class="inline"><input type="hidden" name="_csrf" value="${csrf}"><button class="btn sm">Mark as read</button></form>`}
<button type="button" class="btn sm danger" data-del="${A}/messages/${m.id}/delete">Delete</button></div></div>`).join('') : '<div class="card"><p class="muted">No messages yet. Visitors send messages from the “Suggest a Story” / Contact page.</p></div>';
    res.send(page(req, 'Messages', body, { cur: '/messages' }));
  });
  r.post('/messages/:id/read', need('messages'), async (req, res) => { await db.q('UPDATE messages SET is_read=TRUE WHERE id=$1', [parseInt(req.params.id) || 0]); back(res, A + '/messages', 'Marked as read.'); });
  r.post('/messages/:id/delete', need('messages'), async (req, res) => { await db.q('DELETE FROM messages WHERE id=$1', [parseInt(req.params.id) || 0]); back(res, A + '/messages', 'Message deleted.'); });

  // ------------------------------------------------ users (super admin only)
  const userForm = (req, u) => {
    const perms = String((u && u.perms) || 'videos,analytics').split(',');
    return `<form method="post" action="${A}/users/save" class="card form"><input type="hidden" name="_csrf" value="${esc(req.session.csrf)}"><input type="hidden" name="id" value="${u ? u.id : ''}">
${fieldsHTML([
      { name: 'username', label: 'Username (for login)', req: true, half: true }, { name: 'name', label: 'Display name', half: true },
      { name: 'password', label: u ? 'New password (leave empty to keep current)' : 'Password (min 6 characters)', type: 'password', req: !u, half: true },
      { name: 'role', label: 'Role', type: 'select', options: [['editor', 'Editor — limited access (choose below)'], ['super', 'Super Admin — full access']], half: true },
      { name: 'active', label: 'Account active (can log in)', type: 'bool', def: true }
    ], u || {})}
<h3 class="fs-h">Editor permissions <small>Only used when role = Editor</small></h3>
<div class="perm-grid">${Object.entries(PERMS).map(([k, l]) => `<label class="chk"><input type="checkbox" name="perm" value="${k}" ${perms.includes(k) || perms.includes('*') ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div>
<div class="form-b"><span class="grow"></span><a class="btn" href="${A}/users">Cancel</a><button class="btn p">Save user</button></div></form>`;
  };
  r.get('/users', need('__super'), async (req, res) => {
    const rows = await db.all('SELECT * FROM users ORDER BY role DESC, id');
    const body = `<div class="card flush"><table class="tbl"><thead><tr><th>User</th><th>Role</th><th>Access</th><th>Last login</th><th>Status</th><th></th></tr></thead><tbody>
${rows.map((u) => `<tr><td><a class="ttl" href="${A}/users/${u.id}">${esc(u.name || u.username)}</a><small>@${esc(u.username)}</small></td><td>${u.role === 'super' ? '<span class="pill p">Super Admin</span>' : '<span class="pill">Editor</span>'}</td>
<td><small>${u.role === 'super' ? 'Everything' : esc(String(u.perms).split(',').map((p) => PERMS[p] || p).join(', '))}</small></td><td><small>${u.last_login ? ago(u.last_login) : 'never'}</small></td>
<td>${u.active ? '<span class="pill ok">Active</span>' : '<span class="pill">Disabled</span>'}</td>
<td class="acts"><a class="icon" href="${A}/users/${u.id}">${ic('edit')}</a>${u.id !== req.user.id ? `<button type="button" class="icon danger" data-del="${A}/users/${u.id}/delete">${ic('del')}</button>` : ''}</td></tr>`).join('')}
</tbody></table></div><p class="intro">Editors can only open the sections you tick for them. By default an editor can manage videos (add, edit, delete links) and see analytics.</p>`;
    res.send(page(req, 'Users', body, { cur: '/users', actions: `<a class="btn p" href="${A}/users/new">${ic('plus')}Add user</a>` }));
  });
  r.get('/users/:id', need('__super'), async (req, res, next) => {
    const u = req.params.id === 'new' ? null : await db.one('SELECT * FROM users WHERE id=$1', [parseInt(req.params.id) || 0]);
    if (req.params.id !== 'new' && !u) return next();
    res.send(page(req, u ? 'Edit user' : 'Add user', userForm(req, u), { cur: '/users' }));
  });
  r.post('/users/save', need('__super'), async (req, res) => {
    const id = parseInt(req.body.id), b = req.body;
    const username = String(b.username || '').trim().toLowerCase();
    if (!/^[a-z0-9_.-]{3,40}$/.test(username)) return back(res, req.get('referer'), 'Username: 3-40 letters, numbers, dot, dash or underscore.', 'err');
    const pw = String(b.password || '');
    if ((!id && pw.length < 6) || (pw && pw.length < 6)) return back(res, req.get('referer'), 'Password must be at least 6 characters.', 'err');
    const role = b.role === 'super' ? 'super' : 'editor';
    const perms = role === 'super' ? '*' : [].concat(b.perm || []).filter((p) => PERMS[p]).join(',');
    const active = [].concat(b.active).includes('1');
    if (id === req.user.id && (!active || role !== 'super')) return back(res, req.get('referer'), 'You cannot remove your own super admin access.', 'err');
    try {
      if (id) {
        await db.q('UPDATE users SET username=$1,name=$2,role=$3,perms=$4,active=$5 WHERE id=$6', [username, String(b.name || '').trim(), role, perms, active, id]);
        if (pw) { await db.q('UPDATE users SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(pw, 10), id]); await db.q('DELETE FROM sessions WHERE user_id=$1 AND token<>$2', [id, req.session.token]); }
        if (!active) await db.q('DELETE FROM sessions WHERE user_id=$1', [id]);
      } else {
        await db.q('INSERT INTO users(username,name,password_hash,role,perms,active) VALUES($1,$2,$3,$4,$5,$6)', [username, String(b.name || '').trim(), await bcrypt.hash(pw, 10), role, perms, active]);
      }
    } catch (e) { if (e.code === '23505') return back(res, req.get('referer'), 'That username is already taken.', 'err'); throw e; }
    await log(req, `${id ? 'Edited' : 'Created'} user ${username} (${role})`);
    back(res, A + '/users', 'User saved.');
  });
  r.post('/users/:id/delete', need('__super'), async (req, res) => {
    const id = parseInt(req.params.id) || 0;
    if (id === req.user.id) return back(res, A + '/users', 'You cannot delete yourself.', 'err');
    await db.q('DELETE FROM users WHERE id=$1', [id]);
    await log(req, `Deleted user #${id}`);
    back(res, A + '/users', 'User deleted.');
  });

  // ------------------------------------------------ my account
  r.get('/account', async (req, res) => {
    const body = `<form method="post" class="card form narrow"><input type="hidden" name="_csrf" value="${esc(req.session.csrf)}">
${fieldsHTML([{ name: 'name', label: 'Display name' }, { name: 'current', label: 'Current password', type: 'password', req: true }, { name: 'password', label: 'New password (leave empty to keep)', type: 'password' }, { name: 'password2', label: 'Repeat new password', type: 'password' }], { name: req.user.name })}
<div class="form-b"><span class="grow"></span><button class="btn p">Save</button></div></form>`;
    res.send(page(req, 'My account', body, { cur: '/account' }));
  });
  r.post('/account', async (req, res) => {
    const b = req.body;
    if (!(await bcrypt.compare(String(b.current || ''), req.user.password_hash))) return back(res, A + '/account', 'Current password is wrong.', 'err');
    if (b.password) {
      if (String(b.password).length < 6) return back(res, A + '/account', 'New password must be at least 6 characters.', 'err');
      if (b.password !== b.password2) return back(res, A + '/account', 'The two new passwords do not match.', 'err');
      await db.q('UPDATE users SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(String(b.password), 10), req.user.id]);
      await db.q('DELETE FROM sessions WHERE user_id=$1 AND token<>$2', [req.user.id, req.session.token]);
    }
    await db.q('UPDATE users SET name=$1 WHERE id=$2', [String(b.name || '').trim(), req.user.id]);
    await log(req, 'Updated own account');
    back(res, A + '/account', 'Account saved.');
  });

  // ------------------------------------------------ activity log
  r.get('/activity', need('__super'), async (req, res) => {
    const rows = await db.all('SELECT a.*, u.username FROM activity a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.ts DESC LIMIT 300');
    const body = `<div class="card flush"><table class="tbl"><thead><tr><th>When</th><th>User</th><th>Action</th></tr></thead><tbody>
${rows.map((a) => `<tr><td><small>${fmtDate(a.ts)}</small></td><td>${esc(a.username || '—')}</td><td>${esc(a.action)}</td></tr>`).join('')}</tbody></table></div>`;
    res.send(page(req, 'Activity Log', body, { cur: '/activity' }));
  });

  app.use(A, r);
}

module.exports = { register };
