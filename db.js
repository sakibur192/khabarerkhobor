// Database: connection, automatic table creation and first-time demo data.
// You never need to run SQL by hand — tables are created on first start.
const { Pool, Client } = require('pg');
const bcrypt = require('bcryptjs');
const config = require('./config');

const dbConf = {
  host: config.database.host,
  port: config.database.port,
  user: config.database.user,
  password: config.database.password,
  database: config.database.database,
  ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
  max: 15
};

const pool = new Pool(dbConf);
pool.on('error', (e) => console.error('[db] idle client error:', e.message));

const q = (text, params) => pool.query(text, params);
const one = async (text, params) => (await pool.query(text, params)).rows[0] || null;
const all = async (text, params) => (await pool.query(text, params)).rows;

// Create the database itself if it does not exist yet
async function ensureDatabase() {
  try {
    const c = new Client(dbConf); await c.connect(); await c.end(); return;
  } catch (e) {
    if (e.code !== '3D000') throw e; // 3D000 = database does not exist
  }
  console.log(`[db] database "${dbConf.database}" not found, creating it...`);
  const admin = new Client({ ...dbConf, database: 'postgres' });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${dbConf.database.replace(/"/g, '')}"`);
  await admin.end();
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor',          -- 'super' or 'editor'
  perms TEXT NOT NULL DEFAULT 'videos,analytics',-- comma list for editors
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS labels (key TEXT PRIMARY KEY, bn TEXT NOT NULL DEFAULT '', en TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name_bn TEXT NOT NULL DEFAULT '', name_en TEXT NOT NULL DEFAULT '',
  in_nav BOOLEAN NOT NULL DEFAULT TRUE,
  in_pills BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort INT NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS series (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title_bn TEXT NOT NULL DEFAULT '', title_en TEXT NOT NULL DEFAULT '',
  desc_bn TEXT NOT NULL DEFAULT '', desc_en TEXT NOT NULL DEFAULT '',
  badge_bn TEXT NOT NULL DEFAULT '', badge_en TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort INT NOT NULL DEFAULT 0,
  demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS videos (
  id SERIAL PRIMARY KEY,
  yt_id TEXT NOT NULL,
  yt_url TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'video',            -- 'video' or 'short'
  title_bn TEXT NOT NULL DEFAULT '', title_en TEXT NOT NULL DEFAULT '',
  desc_bn TEXT NOT NULL DEFAULT '', desc_en TEXT NOT NULL DEFAULT '',
  category_id INT REFERENCES categories(id) ON DELETE SET NULL,
  series_id INT REFERENCES series(id) ON DELETE SET NULL,
  episode INT,
  badge_bn TEXT NOT NULL DEFAULT '', badge_en TEXT NOT NULL DEFAULT '',
  place_bn TEXT NOT NULL DEFAULT '', place_en TEXT NOT NULL DEFAULT '',
  duration TEXT NOT NULL DEFAULT '',
  thumb_url TEXT NOT NULL DEFAULT '',
  yt_views BIGINT NOT NULL DEFAULT 0,
  plays INT NOT NULL DEFAULT 0,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  play_mode TEXT NOT NULL DEFAULT 'inherit',     -- inherit | inline | page | youtube
  status TEXT NOT NULL DEFAULT 'published',      -- published | draft
  demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS videos_pub_idx ON videos (status, published_at DESC);
CREATE INDEX IF NOT EXISTS videos_cat_idx ON videos (category_id);
CREATE TABLE IF NOT EXISTS ads (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  position TEXT NOT NULL DEFAULT 'header',
  kind TEXT NOT NULL DEFAULT 'text',             -- text | image | html
  label_bn TEXT NOT NULL DEFAULT '', label_en TEXT NOT NULL DEFAULT '',
  title_bn TEXT NOT NULL DEFAULT '', title_en TEXT NOT NULL DEFAULT '',
  text_bn TEXT NOT NULL DEFAULT '', text_en TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  image_mobile TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  html TEXT NOT NULL DEFAULT '',
  starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  impressions BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  sort INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ticker (
  id SERIAL PRIMARY KEY,
  text_bn TEXT NOT NULL DEFAULT '', text_en TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort INT NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sections (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL,                            -- latest | trending | featured | category | shorts | series
  title_bn TEXT NOT NULL DEFAULT '', title_en TEXT NOT NULL DEFAULT '',
  sub_bn TEXT NOT NULL DEFAULT '', sub_en TEXT NOT NULL DEFAULT '',
  category_id INT REFERENCES categories(id) ON DELETE SET NULL,
  series_id INT REFERENCES series(id) ON DELETE SET NULL,
  limit_n INT NOT NULL DEFAULT 8,
  style TEXT NOT NULL DEFAULT 'grid',            -- grid | panel | dark
  sort INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS menus (
  id SERIAL PRIMARY KEY,
  location TEXT NOT NULL DEFAULT 'footer1',      -- footer1 | footer2 | nav
  label_bn TEXT NOT NULL DEFAULT '', label_en TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '#',
  new_tab BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort INT NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS pages (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title_bn TEXT NOT NULL DEFAULT '', title_en TEXT NOT NULL DEFAULT '',
  body_bn TEXT NOT NULL DEFAULT '', body_en TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS subscribers (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  lang TEXT NOT NULL DEFAULT 'bn',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  type TEXT NOT NULL,                            -- pageview | play | ad_view | ad_click | share | subscribe
  path TEXT NOT NULL DEFAULT '',
  video_id INT, ad_id INT,
  visitor TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT '',
  browser TEXT NOT NULL DEFAULT '',
  os TEXT NOT NULL DEFAULT '',
  referrer TEXT NOT NULL DEFAULT '',
  lang TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS events_ts_idx ON events (ts);
CREATE INDEX IF NOT EXISTS events_type_ts_idx ON events (type, ts);
CREATE INDEX IF NOT EXISTS events_video_idx ON events (video_id) WHERE video_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS activity (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

// ---- Default settings (all editable from Admin → Settings) ----------
const DEFAULT_SETTINGS = {
  site_name_bn: 'খাবারের খবর',
  site_name_en: 'Khabarer Khobor',
  tagline_bn: 'খাবারের খবর • কালিনারি নিউজ নেটওয়ার্ক',
  tagline_en: 'Khabarer Khobor • Culinary News Network',
  meta_desc_bn: 'বাংলাদেশের খাবার, রান্না, স্ট্রিট ফুড ও খাদ্য-সংস্কৃতি নিয়ে ভিডিও সংবাদ ও ডকুমেন্টারি।',
  meta_desc_en: "Bangladesh's culinary video news network — food documentaries, street food, recipes and investigations.",
  logo: '/img/logo.png',
  favicon: '/img/favicon.png',
  og_image: '/img/icon-192.png',
  default_lang: 'bn',
  primary_color: '#b70011',
  accent_color: '#dc2626',
  // Player behaviour
  hero_mode: 'latest',           // latest | featured
  play_mode: 'inline',           // inline (popup player) | page (video page) | youtube (open YouTube)
  hero_autoplay: '1',            // autoplay main video (muted, browsers require it)
  mini_player: '1',              // float to corner when scrolled
  hover_preview: '1',            // muted preview on hover (desktop)
  show_related: '1',
  // Header / top bar
  show_topbar: '1',
  topbar_info_bn: 'ঢাকা ২৮°সে',
  topbar_info_en: 'Dhaka 28°C',
  show_market: '1',
  market_bn: 'ঢাকা কিচেন ইনডেক্স: ইলিশ (৳১,৪৫০/কেজি) • সরিষার তেল (৳১৯০/লি) • মিনিকেট (৳৭২/কেজি)',
  market_en: 'Dhaka Kitchen Index: Hilsa (৳1,450/kg) • Mustard Oil (৳190/L) • Miniket (৳72/kg)',
  show_ticker: '1',
  ticker_label_bn: 'ব্রেকিং ফুড',
  ticker_label_en: 'Breaking Food',
  // Channel
  youtube_channel_url: 'https://youtube.com',
  subscribe_text_bn: 'সাবস্ক্রাইব ২.৪M',
  subscribe_text_en: 'Subscribe 2.4M',
  channel_name: 'Khabarer Khobor Newsroom',
  channel_subs_bn: '২৪,১০,৮৯০ ইউটিউব সাবস্ক্রাইবার',
  channel_subs_en: '2,410,890 YouTube Subscribers',
  network_badge_bn: 'কেকে ভিডিও নেটওয়ার্ক',
  network_badge_en: 'KK Video Network',
  // Info banner under hero
  intro_title_bn: 'ইউটিউবে অফিসিয়াল খাদ্য আর্কাইভ',
  intro_title_en: 'Official Culinary Archive on YouTube',
  intro_text_bn: '৬৪ জেলায় আমাদের মাঠ সাংবাদিকদের তৈরি খাদ্য ডকুমেন্টারি দেখুন।',
  intro_text_en: 'Watch food documentaries produced by Khabarer Khobor field journalists across 64 districts.',
  // Bottom strip
  strip_title_bn: 'খাবারের খবর ভিডিও নিউজরুম হাব',
  strip_title_en: 'Khabarer Khobor Video Newsroom Hub',
  strip_text_bn: 'সকল ডকুমেন্টারি খাদ্য সাংবাদিকতার নৈতিক মানদণ্ড মেনে তৈরি। বাণিজ্যিক স্পনসরশিপ স্পষ্টভাবে ঘোষণা করা হয়।',
  strip_text_en: 'All documentaries follow food journalism ethics standards. Commercial sponsorships are always declared.',
  show_strip: '1',
  // Footer
  footer_about_bn: 'খাবারের খবর বাংলাদেশের খাদ্য সাংবাদিকতার নেটওয়ার্ক — অনুসন্ধান, স্ট্রিট ফুড ডকুমেন্টারি, খাদ্য ঐতিহ্য ও বাজারদরের খবর।',
  footer_about_en: "Khabarer Khobor is Bangladesh's culinary journalism network — investigations, street-food documentaries, food heritage and market intelligence.",
  footer_col1_bn: 'বিভাগ', footer_col1_en: 'Sections',
  footer_col2_bn: 'সম্পাদকীয় ও আস্থা', footer_col2_en: 'Editorial & Trust',
  copyright_bn: '© ২০২৬ খাবারের খবর মিডিয়া নেটওয়ার্ক। সর্বস্বত্ব সংরক্ষিত।',
  copyright_en: '© 2026 Khabarer Khobor Media Network. All rights reserved.',
  show_newsletter: '1',
  social_facebook: '', social_youtube: 'https://youtube.com', social_instagram: '', social_tiktok: '', social_x: '',
  contact_email: '',
  // Analytics & tracking
  ga_id: '',            // e.g. G-XXXXXXX
  pixel_id: '',         // e.g. 123456789012345
  head_code: '',        // any extra <head> code (verification tags etc.)
  body_code: '',        // any extra code before </body>
  self_analytics: '1',
  // Optional YouTube Data API key (auto-fill duration & views)
  yt_api_key: ''
};

async function migrate() {
  await ensureDatabase();
  await pool.query(SCHEMA);
  // settings defaults (never overwrite existing values)
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    await pool.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT (key) DO NOTHING', [k, v]);
  }
  const u = await one('SELECT COUNT(*)::int AS n FROM users');
  if (!u.n) {
    const hash = await bcrypt.hash(config.defaultAdmin.password, 10);
    await q(`INSERT INTO users(username,name,password_hash,role,perms) VALUES($1,$2,$3,'super','*')`,
      [config.defaultAdmin.username, config.defaultAdmin.name, hash]);
    console.log(`[db] created super admin "${config.defaultAdmin.username}" (password from config.js)`);
    await seedDemo();
  }
  // housekeeping
  await q(`DELETE FROM sessions WHERE expires_at < NOW()`);
  await q(`DELETE FROM events WHERE ts < NOW() - ($1 || ' days')::interval`, [String(config.analyticsKeepDays)]);
}

// ---------------- Demo content (first start only) -------------------
// Demo videos use a sample YouTube video. Replace them from the admin
// panel, or press "Remove demo content" on the dashboard.
async function seedDemo() {
  const DEMO_YT = 'aqz-KE-bpKQ';
  const cats = [
    ['bangladesh', 'বাংলাদেশ', 'Bangladesh', true],
    ['world-food', 'বিশ্বের খাবার', 'World Food', true],
    ['food-culture', 'খাদ্য সংস্কৃতি', 'Food Culture', true],
    ['investigations', 'অনুসন্ধান', 'Investigations', true],
    ['street-food', 'স্ট্রিট ফুড', 'Street Food', true],
    ['recipes', 'রেসিপি', 'Recipes', true],
    ['chef-interviews', 'শেফ সাক্ষাৎকার', 'Chef Interviews', false],
    ['regional-heritage', 'আঞ্চলিক ঐতিহ্য', 'Regional Heritage', false],
    ['food-travel', 'খাদ্য ভ্রমণ', 'Food Travel', false]
  ];
  const catId = {};
  for (let i = 0; i < cats.length; i++) {
    const [slug, bn, en, nav] = cats[i];
    const r = await one(`INSERT INTO categories(slug,name_bn,name_en,in_nav,sort) VALUES($1,$2,$3,$4,$5) RETURNING id`, [slug, bn, en, nav, i]);
    catId[slug] = r.id;
  }
  const s = await one(`INSERT INTO series(slug,title_bn,title_en,desc_bn,desc_en,badge_bn,badge_en,demo)
    VALUES('heritage-kitchen','ঐতিহ্যের রান্নাঘর','The Heritage Kitchen','বাংলার নদী, হাওর আর বন্দরের হারানো রান্নার খোঁজে পূর্ণাঙ্গ ডকুসিরিজ।','A complete docuseries tracing lost recipes of Bengal’s rivers, wetlands and ports.','ফ্ল্যাগশিপ ডকুসিরিজ','Flagship Docuseries',TRUE) RETURNING id`);

  const G = 'https://lh3.googleusercontent.com/aida-public/';
  // [kind, title_bn, title_en, desc_bn, desc_en, cat, badge_bn, badge_en, place_bn, place_en, duration, yt_views, thumb, hoursAgo, series ep, featured]
  const V = [
    ['video', 'নাজিরা বাজারের ৭৫ বছরের রহস্য: আসল কাচ্চি বিরিয়ানির অর্থনীতি', "Nazira Bazar's 75-Year Secret: The Economics of Real Kacchi Biryani", 'পুরান ঢাকায় মাংস সংগ্রহ, মসলা পেষা ও কাঠের আগুনে দম দেওয়ার প্রক্রিয়ার নিরীক্ষা।', 'An audit of meat procurement, raw spice grinding, and wood-fire sealing practices in historic Old Dhaka.', 'investigations', 'ট্রেন্ডিং', 'Trending', '', '', '18:42', 184000, G + 'AB6AXuCkW3nn-8A0octKZirhCQaw8AHYSimp1bgUIYmjiwDNbEJAAzO8nocUlispOqbL38eiYNm7sZ_ytzRxgZE8Zk5EPMy0h2uq_uljW4tWJz_aAdh-4cLyjRTtc83KS0QuFWXIm7m26F2f3CZffE0QTXlmfYgsnWxsUNvfWNWOfOtxCU6c1OBIp0RlAin3l60wEY6kFHxAVYMbAbTwbj78WLczgcFGl7-jTSOQ7cBcWBQGmkHYtoaKfJI5IA', 48],
    ['video', 'উপকূলের ইলিশ পথ: চাঁদপুর ঘাট থেকে ঢাকার খাবার টেবিল', 'The Coastal Hilsa Route: From Chandpur Ghats to Dhaka Dinner Tables', 'পাইকারি দাম বৃদ্ধি, কোল্ড স্টোরেজ সিন্ডিকেট ও নদী সংরক্ষণ আইনের অনুসন্ধান।', 'Investigating wholesale price hikes, cold storage syndicates, and river conservation laws.', 'investigations', 'অনুসন্ধান', 'Investigation', '', '', '22:10', 295000, G + 'AB6AXuDm-ypANS0MwNFVPKRYciyhwgIKl8ZDGQ09dxxMmkoz-5G1ifFgZ6FrySkSgOc9CGbfjEva4fTUXu7k72AuK44-u4T4iPEN3QetdWZhPOZjiRiXPH9UES7qg1--irs3sHTA8LojV-9LJeIb5DOF0uCum-_sGpUDFWLZI2pFaiFaPN-3YRfAOJtjyxFJpAzdQafLe4R6sr3KL6VsnJu-Ux0Dbe9CXINPeSQ_totOxo30WisjnK5sr-tx_A', 96],
    ['video', 'শ্রীমঙ্গলের সাত স্তর: সাত রঙের চায়ের রসায়ন ও ইতিহাস', 'Seven Layers of Sreemangal: The Chemistry and History of Layered Tea', 'ঘনত্বের পার্থক্য, গোপন সিরাপ আর এই বিখ্যাত পানীয়ের পেছনের খাদ্য-পর্যটন।', 'Deconstructing density gradients, proprietary syrups, and the culinary tourism behind the iconic drink.', 'bangladesh', 'মাঠের খবর', 'Field Beat', '', '', '14:05', 142000, G + 'AB6AXuB-zg8Z8gt4mKnW9RD8pZWrCbeU2X4ORx-USnlzfRdLMBTRpWwESU2ZZ1JNrYr0mM-XO6_SI5C3VLegpdkYizq3ey3X3JAUfyVekRXiCQpeEK4j9-IJr0BjAO0l-NYHuLWzmB99q5ZlVGVDpBWxd_FthfVQBELqyvj8m9isBhVHLpqO2Ari9QqH6uPKM_gxcck6nrTNVLv9n97fDUlT-HjDQNiMbJ7M1AjB2hjiU4lm_GFmC9GCrmiIhQ', 168],
    ['video', 'বগুড়ার দই: জিআই স্বীকৃত এই দই শেরপুরের বাইরে কেন হয় না', 'Bogurar Doi: Why Replicating this GI-Tagged Curd Outside Sherpur Fails', 'দুধের জীবাণু কালচার, কাঠের আগুনে জ্বাল আর লাল মাটির পাত্রের রহস্য।', 'Dairy microbial cultures, wood-fired reduction vats, and the porous red clay vessels examined.', 'regional-heritage', 'জিআই ঐতিহ্য', 'GI Heritage', '', '', '16:50', 420000, G + 'AB6AXuDEuIGLkxPduIWG9Y3f_xIPozHGjEEUOIxZpWjuyspMLSV9XOomhIcJkQcJMgQMBYC2aG-qzc16tUB0K7JeroqvoFFxltTAX5-0KFPfyuAK4hhlNG-tEJvv6QlIhV80_8v1y_a9JpJV03CZpYM5HTQzEc55sZK5QarugXm-xsI9ICpLTMG8zkyiuAYjGY4q1hWbX3S_xcQvuYM8_wfR7I3Dz6xTa08zn5J2PPX_VUAdp7hOpUderUItvA', 336, null, true],
    ['short', 'সরিষার তেলে ফোড়ন দেওয়ার যে ভুল সবাই করে! 🌶️', 'Mustard Oil Tempering Mistake Everyone Makes! 🌶️', '', '', 'recipes', '', '', '', '', '0:58', 980000, G + 'AB6AXuDDAR4EDt2NyeSzRu0CG8FP29vWVWsRPGYmF0yUkigPlQs6TIgzmRIgRn-vRzAlaFYYRHtyWS6mfYvsEPIYTw69dci9IFhgOGdpVFLUHgM59V53MJPhV8g3Ir-Iql7UmZAK7KMif_WCLL4_rHdATzf71XmU2vS6cR_qSDGGLlQh2kFD_iXAQi4f446vEfNhimf4OUXdDrHWi24yJVhpOn1HyhKzyNI65J4JVlVZ0ja2xiS0QQSyB7wPSA', 20],
    ['short', '৬০ সেকেন্ডে ঢাকার ঝালমুড়ির রসায়ন 🍋', '60-Second Dhaka Jhalmuri Chemistry 🍋', '', '', 'street-food', '', '', '', '', '0:59', 1400000, G + 'AB6AXuAaVTFnOgQqbK9igfqc0QgsDwWC128TtZGcAhq4acaIaygYrr_vtZ6Yyo8jlJRFpKiJWhzT0Z7ImDGeDAO-57FG8mIGaxRhHzBP8dJ9u-IUOTA6OeSRhBQRUjiN049mbi3AWiIZmP18qIrN-ba2hxtTCqXjKxc3OT1hRgAZY0yOtmqfxiNnhu49zXpS11_QGNnxt-t_Q7m0KmS6NyYo6A0YyBdLPp2qA9PNuwFp0qD_TZCCY1lfglAC0w', 30],
    ['short', 'টক তেঁতুল পানির গোপন অনুপাত', 'The Secret Sour Tamarind Water Ratio', '', '', 'street-food', '', '', '', '', '0:45', 2100000, G + 'AB6AXuAJM7CAWQHL5Ot2lA4-ssw_blvyRFx4c1hGqYKjejY-ZWlozfN44EOPjmpi6b4H4CN8c05EbGN2ki8HqL5tspDsMSHNj4Nc9OC5lyvyO0CFQt1bzCRsHJ2EDtirwt7xQOTOrpfWsoL5KcdMCpXgimC1ShpFSAvGIRfeejmoBgFMsFWL_LNnQZdgsH69SaevKHnTT2Z2Q63q3kIezS-vnzIGppolNE92i8M51g2ksrQNI78eajMO0NRhYg', 40],
    ['short', 'বাঙালি বঁটির কৌশল আয়ত্ত করুন 🔪', 'Mastering the Traditional Bengali Boti Knife 🔪', '', '', 'food-culture', '', '', '', '', '0:52', 840000, G + 'AB6AXuBwtEO9lLZclx4wbK-l9HroRyDjjBmuE1whhTUZ7JJnwiM6Eni-usv2i0h7T_-huOOSiatpt3qYaIPaYQN0673TPJa5ZLgxoChAyk9Ca3E81STywx1rKRnILy20CGKQMMgbiLkt77tlOL0FN0ZFTfyHzGaxzBZco7mAYvTzZ4t2RJ8OzN4YWkQ_Htm7cTVY9zJarxmR2l8oCMtJxkNhiztApCSpnuvMvWwFZDWjMTeF9QKRQ4SGwZ3UYw', 50],
    ['short', 'শীতের ভাপা পিঠা: ৪৫ সেকেন্ডে! 🍯', 'Winter Bhapa Pitha: Steaming under 45 seconds! 🍯', '', '', 'recipes', '', '', '', '', '0:44', 1800000, G + 'AB6AXuAmud8DROtXoyYY5jSxFZm3uEv__RTxUY1qeoUR_Gmg1MuhAnAR-fOVjJoKU5zvESE0XDdvnUklaMaBY4IBqPgsAvSL0Pf9Wjw4paOu4xp0dG9JCyxC3Bn4NjHqSC2yUxCngpNdjkacwdFcen_uitDfEjRpMRc0lDWy9DMW3nXEb88-ZEMtbtXtL3hOO5JrS4DajsqekUzw1LtMUKvkaGbNyLwtsq6HQ1LEY5VYDiTRuRX9V0fdn6X9_A', 60],
    ['video', 'সরষে ইলিশ: সরিষা আর নদীর জ্যামিতি', 'Shorshe Ilish: The Geometry of Mustard & River', 'ঠান্ডা চাপে ভাঙা দেশি সরিষার ঝাঁঝ আর নদীর ইলিশের চর্বির রসায়ন।', 'Unpacking the biochemical sharpness of cold-pressed local mustard seeds paired with river fat profiles.', 'regional-heritage', '', '', 'পদ্মা অববাহিকা', 'Padma River Basin', '32:40', 98000, G + 'AB6AXuCJAHkhcNyyp1qDB2bVEOlELDFR1OYLIhVX9yO2wJefgXhdOlNaVPmNEkMf46ri9HSbfmkXgNTq3zj7YHn5wvn_4eK4maFA2cjCtJXgYKL2krIHzSsKKChA1xq1uPJRHg0BbzzVwIXBHiVvlHQNXgAFYO0Et_uZD4Ya5IB42wJwkfJKleLKQuIMijMUfoO1XbFuVjBWJPsIfuWY2l33De2xTdd7z7i9YVhSVhkhpatJlyxv95Lumf2_Qw', 400, 1],
    ['video', 'ভাসমান বাজার ও খালের রান্নাঘর', 'The Floating Markets & Canal Kitchens', 'শাপলার ডাঁটা, পুকুরের মাছের ঝোল আর ভাসমান বিক্রেতাদের দৈনন্দিন রেসিপি।', 'Tracing indigenous water-lily stems, pond carp curries, and floating vendor subsistence recipes.', 'regional-heritage', '', '', 'বরিশালের জলাভূমি', 'Barisal Wetlands', '27:14', 76000, G + 'AB6AXuD6vki_OM30edN70Duxakexrf51v1ywUwF8gA1yCCa1tdkMeyQNEypK1WBx1y0-icAHbREG35PNvgHyLTzE07UJ1WdLu7xhccjMPYRpCrqEqP8JwXnHpy4kT1cKYykp1nx3zaJFzwIKlkjkEDXSWeuzRscSDT7uJOrgHSmCY8KMyRvxOCMRy2QoAGkR0UXZG6tFXuYb5gFrZwqsJvJhMxyEq3A47GRWrtNcVHQevN05r8hD9o-7uMSpGQ', 390, 2],
    ['video', 'কালা ভুনা: চার ঘণ্টার জ্বালের কারিগরি', 'Kala Bhuna: The 4-Hour Reduction Mastery', 'আসল মেজবানি বাবুর্চিরা কেন কৃত্রিম রং বাদ দিয়ে ধীরে পেঁয়াজ পোড়ানোর ওপর নির্ভর করেন।', 'Why authentic Mezban cooks reject artificial food dyes and rely on slow onion caramelisation.', 'regional-heritage', '', '', 'চট্টগ্রাম বন্দর', 'Chattogram Port', '34:18', 112000, G + 'AB6AXuDv5_06DKbv3QjR9DjLEeJaR-4-j3MFBQNmfyxfTvqvXrJOd6d7BYUbSUmR95rxptOve9xFuYmX_vuAFCDTRfQZklFZ17i2rBfvs53duUZA-INoCkHIp67-oCE3Uqzpze5mqu3Rf6-QXzm5_aXFt98mLqhBtYq_rUHKng_3jf2ZkFZFnOxE47fyKuRW0h3tJdhuROoKSYtzeHYOGPRuRhPxs1YKkb4LvU5QM9F30vqXu1B_AhJ7O5wY6g', 380, 3],
    ['video', 'রাতের ইয়াওয়ারাত: চায়নাটাউনের মিশেলিন স্ট্রিট শেফরা', 'Yaowarat After Dark: The Michelin Street Chefs of Chinatown', 'ব্যাংককের নিয়নের নিচে অয়েস্টার অমলেট, কাঁকড়া ফ্রাইড রাইস আর ওক-হেই কৌশল।', 'Testing oyster omelettes, crab fried rice, and wok-hei techniques under Bangkok neon lights.', 'world-food', '', '', 'ব্যাংকক', 'Bangkok', '21:12', 512000, G + 'AB6AXuA27RxE5OtcHXu8tomUBxYSgxdVmIMTbxkRIf05Ol64hj9ykE6MzRkn2q5n0Aba4EZPaj78QwRysoT4ZnOoE6EtqjWLzjSLFiPYVj_hJ9bmYqwNtAtk430-aXYb3uSC0um4triMxXj81MM0Z73I4aZR8R-Lcr43h32Y5zi44oJ1ZVR-G2q4_YR6_LJjkvZrm0RpQR6FejMKpKA5bN0LZjE26jsebtKRuwSS3aamMLkjxZiZvvnYRH8d_g', 200],
    ['video', 'বসফরাসের ধোঁয়া: শতবর্ষী বালিক একমেক ঐতিহ্য', 'Bosphorus Smoke: The Century-Old Balık Ekmek Tradition', 'গ্রিল করা ম্যাকেরেল স্যান্ডউইচ কীভাবে তুরস্কের জলপথের প্রাণ হয়ে উঠল।', 'How fresh-grilled mackerel sandwiches became the culinary heartbeat of the Turkish waterfront.', 'world-food', '', '', 'ইস্তাম্বুল', 'Istanbul', '25:40', 380000, G + 'AB6AXuDmiJP3pkeKwUBGojYqnnqHY0GP7yhoDQN9giaiTbyGLwHtfbApaxmfHw_ECtXOvw4wPgkWfnz8pZugMmPbdlsDF3eakYR4ce6fhhne1lQvCqQCI8lPUz9IYmbpvTz5iLRNOnlG2QHJoI2GzketKL8StU_0wVa0nOYfOWupBt6gbA_gfcauQVZixB1hCoqlyengUTD7tXl4iEsEcIwOHGf8qO43dRYoywlHCjiBdxoRZZOAInTA0Xuypw', 210],
    ['video', 'জর্জ টাউনের চার কোয়ে টিও কারিগররা', 'Char Kway Teow Masters of George Town', 'ইউনেস্কো ঐতিহ্যের পেনাংয়ে ভোর ৫টায় লাইন পড়া হকার স্টলের অনুসন্ধান।', 'Investigating heritage hawker stalls in UNESCO Penang where lines form at 5 AM.', 'world-food', '', '', 'পেনাং', 'Penang', '19:35', 290000, G + 'AB6AXuCtVuE1W4tWiuZr-9qKUGGWbmzXlbx-6t1sWuFaopsZ_QgjLWAbAC5uD-wxBryfZvrdqmHh2JTInKZc88LwnUltdvk_SqVDIr7STHbosadB2FUUmXcKxLnHy1xVZvRdwNkyosisP_H4G4Ugo6ajjNwQBKOb-yHXgSpv3jrrNIUBrVpaz5zB4l11V_EtMVBWNx1OUxT6ogxBEMQMsoitAElnNG1J5JPiIR0nynfc1lWwIYbHzxZqw3xqQg', 220],
    ['video', 'গলি পরাঠেওয়ালি ও তার বাইরে: ঘিয়ে মোগল স্মৃতি', 'Gali Paranthe Wali & Beyond: Mughal Echoes in Spiced Ghee', 'ভাজা পুর-ভরা পরোটা, ধীরে রান্না নিহারি আর রাজকীয় রান্নাঘরের রহস্য।', 'Deep-fried stuffed parathas, slow-simmered Nihari, and royal kitchen legacy secrets.', 'world-food', '', '', 'পুরান দিল্লি', 'Old Delhi', '23:05', 675000, G + 'AB6AXuCPBbJeEYBynsujeNRQFa88jNGJjLfneQH_aKSW2FGG1w8zWZQ6FjhvnGyymPUzYrd46ScQFywINWNO-hOFNct2l3QTO3F_bNRNQgZwemmLIrNhqgVs0xphnhLcNA2iEN_5KJzDksHy3naqBTmvJDL4eFQ6B-hzBElWSKHVdrfMqcVXubpqfACLXyrAT4jG0EAyA9XLA65tIXvc8fkiKrE4u-izsQS_sP3xO5E4EED9NmxOeZ8SY9Q1UA', 230],
    // newest → becomes the main (hero) video when hero mode = "latest"
    ['video', 'প্রাচীন বাংলার হারানো মসলা: চার পর্বের খাদ্য যাত্রা', 'The Lost Spices of Ancient Bengal: A 4-Part Culinary Journey', 'খাদ্য সাংবাদিক তানভীর আহমেদের সাথে সোনারগাঁও ও সুন্দরবনের ভুলে যাওয়া নদীবন্দরে চুই ঝাল, বুনো পিপুল আর শতবর্ষ আগে হারিয়ে যাওয়া সুগন্ধি ধানের খোঁজে।', 'Follow food journalist Tanvir Ahmed through forgotten river ports in Sonargaon and the Sundarbans borderlands to recover wild long pepper (Chui Jhal) and fragrant rice cultivars lost for over a century.', 'investigations', 'অনুসন্ধানমূলক আর্কাইভ', 'Investigative Archive', '', '', '28:15', 310500, G + 'AB6AXuB4774o0Oon91vM-pmqvcXgxqel1dD47N_khkfAT3dAEKTerzmta8WZx22SFXvAoQMqaISqyEdn4lt9lasvgQ-n2LA7lqv82EdHPg5EfMlD2yx7oC6T3TXrqvdOSrQIyaHhuOxs89KBoiiVvQD3PBcPuVsrVgNC1dRwn0182zC3TymYjLI-oT0_2la_4A-iotyBSOKRitG0VbL-xXGcNvQjJnRh1JN-56LqhX4tf0562nLRX8vS1662Ag', 2, null, true]
  ];
  for (const v of V) {
    const [kind, tbn, ten, dbn, den, cat, bbn, ben, pbn, pen, dur, ytv, thumb, hrs, ep, feat] = v;
    await q(`INSERT INTO videos(yt_id,yt_url,kind,title_bn,title_en,desc_bn,desc_en,category_id,series_id,episode,badge_bn,badge_en,place_bn,place_en,duration,yt_views,thumb_url,is_featured,demo,published_at,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,TRUE,NOW()-($19||' hours')::interval,NOW()-($19||' hours')::interval)`,
      [DEMO_YT, 'https://www.youtube.com/watch?v=' + DEMO_YT, kind, tbn, ten, dbn, den, catId[cat], ep ? s.id : null, ep || null, bbn, ben, pbn, pen, dur, ytv, thumb, !!feat, String(hrs)]);
  }

  const secs = [
    ['trending', 'বাংলাদেশজুড়ে ট্রেন্ডিং', 'Trending Across Bangladesh', 'এই সপ্তাহে সবচেয়ে বেশি দেখা অনুসন্ধানী প্রতিবেদন ও স্ট্রিট রেকর্ড।', 'Top investigative reports and street records gaining traction this week.', null, null, 4, 'grid'],
    ['shorts', 'শর্টস ও কুইক বাইটস', 'Shorts & Quick Bites', '৬০ সেকেন্ডের কম সময়ের রান্নার টিপস ও স্ট্রিট সিজল।', 'Micro culinary tutorials, street sizzles and kitchen hacks under 60 seconds.', null, null, 10, 'grid'],
    ['series', 'ঐতিহ্যের রান্নাঘর ডকুসিরিজ', 'The Heritage Kitchen Docuseries', '', '', null, s.id, 6, 'panel'],
    ['latest', 'সর্বশেষ ভিডিও', 'Latest Videos', 'আমাদের নিউজরুম থেকে নতুন প্রকাশিত ভিডিও।', 'Freshly published from our newsroom.', null, null, 8, 'grid'],
    ['category', 'গ্লোবাল স্ট্রিট ফুড প্যাট্রোল', 'Global Street Food Patrol', 'এশিয়া, মধ্যপ্রাচ্য ও তার বাইরের প্রতিনিধিদের খাদ্য প্রতিবেদন।', 'Foreign correspondent culinary reports from Asia, the Middle East and beyond.', catId['world-food'], null, 4, 'grid'],
    ['featured', 'সম্পাদকের বাছাই', "Editor's Picks", '', '', null, null, 4, 'grid']
  ];
  for (let i = 0; i < secs.length; i++) {
    const x = secs[i];
    await q(`INSERT INTO sections(kind,title_bn,title_en,sub_bn,sub_en,category_id,series_id,limit_n,style,sort) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [...x, i]);
  }
  const tick = [
    ['বাংলাদেশের ঐতিহ্যবাহী শীতকালীন পিঠা উৎসব ও খাদ্য সম্মেলন আজ ঢাকায় শুরু', "Bangladesh's traditional winter pitha festival and food summit begins in Dhaka today"],
    ['ইলিশের প্রাচুর্য নিয়ে বিশেষ অনুসন্ধানমূলক প্রতিবেদন', 'Special investigative report on the Hilsa abundance'],
    ['পাইকারি মোকামে ভোজ্যতেলের মূল্যে স্বস্তি', 'Edible oil prices ease in wholesale markets']
  ];
  for (let i = 0; i < tick.length; i++) await q(`INSERT INTO ticker(text_bn,text_en,sort) VALUES($1,$2,$3)`, [...tick[i], i]);

  await q(`INSERT INTO ads(name,position,kind,label_bn,label_en,title_bn,title_en,link,active)
    VALUES('Sample header ad','header','text','স্পনসরড বুলেটিন','Sponsored Bulletin','আপনার বিজ্ঞাপন এখানে — অ্যাডমিন প্যানেল থেকে পরিবর্তন করুন','Your ad here — change it from the admin panel','#',TRUE)`);

  const pages = [
    ['about', 'আমাদের সম্পর্কে', 'About Us', '<p>খাবারের খবর বাংলাদেশের খাদ্য সাংবাদিকতার একটি ভিডিও নেটওয়ার্ক।</p>', '<p>Khabarer Khobor is a culinary video journalism network from Bangladesh.</p>'],
    ['ethics', 'খাদ্য সাংবাদিকতার নীতিমালা', 'Code of Culinary Ethics', '<p>এখানে আপনার নীতিমালা লিখুন।</p>', '<p>Write your ethics policy here.</p>'],
    ['privacy', 'গোপনীয়তা নীতি', 'Privacy Policy', '<p>এখানে আপনার গোপনীয়তা নীতি লিখুন।</p>', '<p>Write your privacy policy here.</p>'],
    ['terms', 'ব্যবহারের শর্তাবলি', 'Terms of Use', '<p>এখানে শর্তাবলি লিখুন।</p>', '<p>Write your terms here.</p>'],
    ['advertise', 'বিজ্ঞাপন দিন', 'Advertise with Us', '<p>বিজ্ঞাপনের জন্য যোগাযোগ করুন।</p>', '<p>Contact us to advertise.</p>']
  ];
  for (const p of pages) await q(`INSERT INTO pages(slug,title_bn,title_en,body_bn,body_en) VALUES($1,$2,$3,$4,$5)`, p);

  const menus = [
    ['footer1', 'বাংলাদেশ', 'Bangladesh', '/c/bangladesh'], ['footer1', 'স্ট্রিট ফুড', 'Street Food', '/c/street-food'],
    ['footer1', 'বিশ্বের খাবার', 'World Food', '/c/world-food'], ['footer1', 'রেসিপি', 'Recipes', '/c/recipes'], ['footer1', 'শর্টস', 'Shorts', '/shorts'],
    ['footer2', 'আমাদের সম্পর্কে', 'About Us', '/p/about'], ['footer2', 'নীতিমালা', 'Code of Ethics', '/p/ethics'],
    ['footer2', 'বিজ্ঞাপন দিন', 'Advertise', '/p/advertise'], ['footer2', 'যোগাযোগ', 'Contact', '/contact'],
    ['bottom', 'গোপনীয়তা নীতি', 'Privacy Policy', '/p/privacy'], ['bottom', 'শর্তাবলি', 'Terms', '/p/terms']
  ];
  for (let i = 0; i < menus.length; i++) await q(`INSERT INTO menus(location,label_bn,label_en,url,sort) VALUES($1,$2,$3,$4,$5)`, [...menus[i], i]);
  console.log('[db] demo content added');
}

module.exports = { pool, q, one, all, migrate, DEFAULT_SETTINGS };
