# খাবারের খবর — Khabarer Khobor

Bilingual (বাংলা / English) food-video news website with a full admin panel.
Node.js + PostgreSQL. **No .env, no .yml** — one settings file: `config.js`.

---

## চালু করার নিয়ম (Bangla)

1. কম্পিউটারে **Node.js 18+** ও **PostgreSQL** ইনস্টল করুন।
2. `config.js` খুলে `database` অংশে আপনার PostgreSQL এর user / password দিন।
   (ডাটাবেস না থাকলে অ্যাপ নিজেই তৈরি করে নেবে।)
3. এই ফোল্ডারে টার্মিনাল খুলে চালান:
   ```
   npm install
   npm start
   ```
4. ওয়েবসাইট: `http://localhost:3000`
   অ্যাডমিন প্যানেল: `http://localhost:3000/admin`
   প্রথম লগইন: **admin / admin123** → লগইনের পর সাথে সাথে পাসওয়ার্ড বদলান (My account)।
5. ড্যাশবোর্ডে **Quick add** বক্সে ইউটিউব লিংক দিন → ভিডিও যোগ হয়ে যাবে।
   ডেমো ভিডিওগুলো মুছতে ড্যাশবোর্ডের **remove demo content** চাপুন।

টেবিল নিজে বানাতে হবে না — প্রথমবার চালু হলে সব টেবিল ও ডেমো কনটেন্ট স্বয়ংক্রিয়ভাবে তৈরি হয়।

## Quick start (English)

```
npm install
npm start
```
Edit `config.js` first (database user/password, `siteUrl` when you go live, `secret`).

---

## What the admin can control

| Area | Where |
|---|---|
| Add / edit / delete YouTube videos & Shorts (single, bulk paste, schedule, draft) | Videos & Shorts |
| Main (big) video: **latest upload automatically** or the newest ★ Featured | Settings → Video Player |
| Click behaviour: play on site (popup + mini player), open video page, or open YouTube — site-wide and per video | Settings → Video Player / each video |
| Autoplay main video (muted + “tap to unmute”), mini player, hover preview, related videos | Settings → Video Player |
| Sponsored ads (text / image / AdSense HTML) in 6 positions, with start–end dates, view & click counts. **No active ad → nothing shown.** | Sponsored Ads |
| Home page rows (latest, trending, featured, category, shorts, series) and their order | Home Sections |
| Categories, Series/playlists, Breaking ticker, Menus, Pages (About, Privacy…) | sidebar |
| Every button/heading text in both languages | Text Labels |
| Site name, logo, favicon, colors, top bar, footer, social links | Site Settings |
| Google Analytics 4, Meta Pixel, extra head/body code | Settings → Analytics & Tracking |
| Built-in analytics: visitors, page views, plays, sources, devices, hours, ad CTR, live visitors | Analytics |
| Newsletter subscribers (CSV export), contact messages | People |
| Users: **Super Admin** (everything) and **Editor** (only the sections you tick — default: videos + analytics) | Users |

Tracking events sent: GA4 `page_view`, `video_play`, `sign_up`; Pixel `PageView`, `ViewContent` (video play), `Lead` (newsletter), `Contact`.

## Speed

Server-rendered HTML, public pages cached in memory (cleared on every admin save), gzip, no CSS framework,
inline SVG icons, lazy thumbnails, YouTube player loads only when needed (`youtube-nocookie`).

## Going live

* **VPS / Coolify / any Node host:** set `siteUrl` and `https: true` in `config.js`, run `npm start` (or `pm2 start server.js`).
* **cPanel “Setup Node.js App”:** startup file `server.js`; the app uses cPanel’s PORT automatically. Create a PostgreSQL database in cPanel and put its name/user/password in `config.js`.
* Back up the `uploads/` folder (logos, ad banners) together with the database.

## Files

```
config.js        ← the only file you edit
server.js        start point
db.js            tables + demo content (automatic)
public.js        website pages
admin.js         admin panel
lib.js, icons.js helpers
public/          css, js, logo
uploads/         images uploaded from admin
```
