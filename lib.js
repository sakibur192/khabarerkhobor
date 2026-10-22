// Shared helpers: escaping, Bangla digits, YouTube link parsing, caching, labels.
const db = require('./db');

// ---------- HTML escaping ----------
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// ---------- Bangla numbers ----------
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const bnNum = (s) => String(s).replace(/[0-9]/g, (d) => BN_DIGITS[d]);
const num = (s, lang) => (lang === 'bn' ? bnNum(s) : String(s));

function compact(n, lang) {
  n = Number(n) || 0;
  let out;
  if (n >= 1e6) out = (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  else if (n >= 1e3) out = (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, '') + 'K';
  else out = String(n);
  return num(out, lang);
}

function timeAgo(date, lang) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(date).getTime()) / 1000));
  const units = [
    [31536000, 'year', 'বছর'], [2592000, 'month', 'মাস'], [604800, 'week', 'সপ্তাহ'],
    [86400, 'day', 'দিন'], [3600, 'hour', 'ঘণ্টা'], [60, 'minute', 'মিনিট']
  ];
  for (const [sec, en, bn] of units) {
    const v = Math.floor(s / sec);
    if (v >= 1) return lang === 'bn' ? `${bnNum(v)} ${bn} আগে` : `${v} ${en}${v > 1 ? 's' : ''} ago`;
  }
  return lang === 'bn' ? 'এইমাত্র' : 'just now';
}

const BN_MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
const BN_DAYS = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];
const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const EN_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function fullDate(d, lang) {
  // Always show Bangladesh time (UTC+6)
  const x = new Date(new Date(d).getTime() + 6 * 3600 * 1000);
  const day = x.getUTCDay(), date = x.getUTCDate(), m = x.getUTCMonth(), y = x.getUTCFullYear();
  return lang === 'bn'
    ? `${BN_DAYS[day]}, ${bnNum(date)} ${BN_MONTHS[m]} ${bnNum(y)}`
    : `${EN_DAYS[day]}, ${EN_MONTHS[m]} ${date}, ${y}`;
}

// ---------- YouTube ----------
// Accepts: watch?v=, youtu.be/, /shorts/, /embed/, /live/, m.youtube, or a bare 11-char ID
function parseYouTube(input) {
  const s = String(input || '').trim();
  if (/^[\w-]{11}$/.test(s)) return { id: s, short: false };
  let m = s.match(/youtube\.com\/shorts\/([\w-]{11})/i);
  if (m) return { id: m[1], short: true };
  m = s.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|live\/))([\w-]{11})/i);
  if (m) return { id: m[1], short: false };
  return null;
}
const ytThumb = (id, q = 'hqdefault') => `https://i.ytimg.com/vi/${id}/${q}.jpg`;
const thumbOf = (v) => v.thumb_url || ytThumb(v.yt_id, v.kind === 'short' ? 'hq720' : 'hqdefault');

async function fetchJSON(url, ms = 6000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) return null; return await r.json(); }
  catch { return null; } finally { clearTimeout(t); }
}
// Title/author without any API key (YouTube oEmbed)
const ytOEmbed = (id) => fetchJSON(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`);
// Duration + views (needs YouTube Data API key in settings – optional)
async function ytDetails(id, key) {
  if (!key) return null;
  const j = await fetchJSON(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics,snippet&id=${id}&key=${encodeURIComponent(key)}`);
  const it = j && j.items && j.items[0];
  if (!it) return null;
  const iso = it.contentDetails.duration || '';
  const mm = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/) || [];
  const h = +mm[1] || 0, mi = +mm[2] || 0, se = +mm[3] || 0;
  const duration = h ? `${h}:${String(mi).padStart(2, '0')}:${String(se).padStart(2, '0')}` : `${mi}:${String(se).padStart(2, '0')}`;
  return { duration, views: +it.statistics.viewCount || 0, title: it.snippet.title, description: it.snippet.description, seconds: h * 3600 + mi * 60 + se };
}

const slugify = (s) => String(s || '').toLowerCase().trim()
  .replace(/[^\wঀ-৿\s-]/g, '').replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

// ---------- Default interface labels (all editable in Admin → Labels) ----------
const DEFAULT_LABELS = {
  home: ['হোম', 'Home'],
  latest: ['সর্বশেষ', 'Latest'],
  shorts: ['শর্টস', 'Shorts'],
  series: ['সিরিজ', 'Series'],
  all_videos: ['সব ভিডিও', 'All Videos'],
  search_ph: ['খাবারের খবর, রেসিপি, ভিডিও খুঁজুন...', 'Search food stories, recipes, videos...'],
  search: ['খুঁজুন', 'Search'],
  search_results: ['অনুসন্ধানের ফলাফল', 'Search results'],
  no_results: ['কিছু পাওয়া যায়নি', 'Nothing found'],
  watch_full: ['পুরো ভিডিও দেখুন', 'Watch Full Film'],
  watch: ['দেখুন', 'Watch'],
  duration: ['সময়কাল', 'Duration'],
  views: ['বার দেখা হয়েছে', 'views'],
  youtube_views: ['ইউটিউব ভিউ', 'YouTube Views'],
  explore_all: ['সব দেখুন', 'Explore All'],
  play_all: ['সব চালান', 'Play All'],
  episode: ['পর্ব', 'Episode'],
  episodes: ['পর্ব', 'Episodes'],
  ep_of: ['পর্ব {a} / {b}', 'Ep {a} of {b}'],
  now_streaming: ['এখন চলছে', 'Now Streaming'],
  share: ['শেয়ার', 'Share'],
  copied: ['লিংক কপি হয়েছে', 'Link copied'],
  save: ['সেভ', 'Save'],
  saved: ['সেভ করা', 'Saved'],
  related: ['আরও দেখুন', 'Up Next'],
  open_youtube: ['ইউটিউবে দেখুন', 'Open on YouTube'],
  minimize: ['ছোট করুন', 'Minimize'],
  close: ['বন্ধ', 'Close'],
  expand: ['বড় করুন', 'Expand'],
  sponsored: ['স্পনসরড', 'Sponsored'],
  newsletter_title: ['কিচেন ডিসপ্যাচ', 'Kitchen Dispatch'],
  newsletter_text: ['বাজারদরের খবর, দুর্লভ রেসিপি আর নতুন ভিডিওর আপডেট পান ইমেইলে।', 'Market alerts, rare recipes and new video updates in your inbox.'],
  email_ph: ['আপনার ইমেইল', 'Your email address'],
  subscribe_now: ['সাবস্ক্রাইব করুন', 'Subscribe Now'],
  thanks_sub: ['ধন্যবাদ! আপনি সাবস্ক্রাইব করেছেন।', 'Thanks! You are subscribed.'],
  invalid_email: ['সঠিক ইমেইল দিন', 'Please enter a valid email'],
  suggest_story: ['গল্পের প্রস্তাব দিন', 'Suggest a Story'],
  contact: ['যোগাযোগ', 'Contact'],
  your_name: ['আপনার নাম', 'Your name'],
  phone: ['ফোন', 'Phone'],
  message: ['বার্তা', 'Message'],
  send: ['পাঠান', 'Send'],
  msg_sent: ['আপনার বার্তা পাঠানো হয়েছে। ধন্যবাদ!', 'Your message has been sent. Thank you!'],
  not_found: ['পৃষ্ঠাটি পাওয়া যায়নি', 'Page not found'],
  back_home: ['হোমে ফিরে যান', 'Back to home'],
  featured: ['ফিচার্ড', 'Featured'],
  published: ['প্রকাশিত', 'Published'],
  load_more: ['আরও লোড করুন', 'Load more'],
  videos_count: ['টি ভিডিও', 'videos'],
  menu: ['মেনু', 'Menu'],
  sort_recent: ['সর্বশেষ প্রকাশিত', 'Most recent'],
  sort_views: ['সর্বাধিক দেখা', 'Most viewed'],
  sort_old: ['পুরোনো আগে', 'Oldest first'],
  description: ['বিবরণ', 'Description'],
  tap_unmute: ['শব্দ চালু করতে ট্যাপ করুন', 'Tap to unmute']
};

// ---------- In-memory cache (cleared on every admin save) ----------
const cache = { settings: null, labels: null, cats: null, menus: null, ticker: null, pages: new Map() };

async function load() {
  const [s, l, c, m, t] = await Promise.all([
    db.all('SELECT key,value FROM settings'),
    db.all('SELECT key,bn,en FROM labels'),
    db.all('SELECT * FROM categories WHERE active ORDER BY sort,id'),
    db.all('SELECT * FROM menus WHERE active ORDER BY sort,id'),
    db.all('SELECT * FROM ticker WHERE active ORDER BY sort,id')
  ]);
  cache.settings = Object.fromEntries(s.map((r) => [r.key, r.value]));
  const labels = {};
  for (const [k, [bn, en]] of Object.entries(DEFAULT_LABELS)) labels[k] = { bn, en };
  for (const r of l) labels[r.key] = { bn: r.bn || (labels[r.key] || {}).bn || '', en: r.en || (labels[r.key] || {}).en || '' };
  cache.labels = labels;
  cache.cats = c; cache.menus = m; cache.ticker = t;
}
function invalidate() { cache.settings = null; cache.pages.clear(); }
async function ensure() { if (!cache.settings) await load(); return cache; }

// translated label
function t(lang, key, vars) {
  const L = cache.labels && cache.labels[key];
  let s = L ? (L[lang] || L.en || L.bn) : key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace('{' + k + '}', v);
  return s;
}
// pick a bilingual field: f(obj,'title',lang) → obj.title_bn / obj.title_en with fallback
const f = (o, field, lang) => (o && (o[`${field}_${lang}`] || o[`${field}_${lang === 'bn' ? 'en' : 'bn'}`])) || '';
const S = (key, lang) => {
  const st = cache.settings || {};
  if (lang) return st[`${key}_${lang}`] || st[`${key}_${lang === 'bn' ? 'en' : 'bn'}`] || '';
  return st[key] || '';
};

// ---------- user agent ----------
function parseUA(ua = '') {
  const device = /ipad|tablet/i.test(ua) ? 'Tablet' : /mobi|android|iphone/i.test(ua) ? 'Mobile' : 'Desktop';
  const browser = /edg\//i.test(ua) ? 'Edge' : /opr\/|opera/i.test(ua) ? 'Opera' : /samsungbrowser/i.test(ua) ? 'Samsung' :
    /chrome|crios/i.test(ua) ? 'Chrome' : /firefox|fxios/i.test(ua) ? 'Firefox' : /safari/i.test(ua) ? 'Safari' : 'Other';
  const os = /android/i.test(ua) ? 'Android' : /iphone|ipad|ios/i.test(ua) ? 'iOS' : /windows/i.test(ua) ? 'Windows' :
    /mac os/i.test(ua) ? 'macOS' : /linux/i.test(ua) ? 'Linux' : 'Other';
  return { device, browser, os };
}
const isBot = (ua = '') => !ua || /bot|crawl|spider|slurp|preview|facebookexternalhit|curl|wget|python|headless|lighthouse/i.test(ua);

module.exports = {
  esc, bnNum, num, compact, timeAgo, fullDate, parseYouTube, ytThumb, thumbOf, ytOEmbed, ytDetails,
  slugify, DEFAULT_LABELS, cache, load, invalidate, ensure, t, f, S, parseUA, isBot
};
