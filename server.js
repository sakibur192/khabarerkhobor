// =====================================================================
//  Khabarer Khobor — main server.   Start with:  npm start
//  Settings: config.js      Admin panel: http://localhost:3000/admin
// =====================================================================
const express = require('express');
const path = require('path');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const config = require('./config');
const db = require('./db');
const L = require('./lib');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true); // correct visitor IP behind cPanel / Nginx / Cloudflare
app.use(compression());
app.use(cookieParser(config.secret));

// basic security headers
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'SAMEORIGIN'
  });
  next();
});

// static files (long cache = fast repeat visits)
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '30d', index: false }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '30d',
  setHeaders: (res) => res.set('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'")
}));

// language: ?lang=bn|en sets a cookie, otherwise cookie, otherwise default from settings
app.use(async (req, res, next) => {
  try {
    await L.ensure();
    const q = req.query.lang;
    if (q === 'bn' || q === 'en') {
      res.cookie('lang', q, { maxAge: 365 * 864e5, sameSite: 'lax', httpOnly: false });
      if (req.method === 'GET' && !req.path.startsWith(config.adminPath)) {
        const u = new URL(req.originalUrl, 'http://x'); u.searchParams.delete('lang');
        return res.redirect(302, u.pathname + (u.search || ''));
      }
      req.lang = q;
    } else {
      const c = req.cookies.lang;
      req.lang = c === 'bn' || c === 'en' ? c : (L.cache.settings.default_lang === 'en' ? 'en' : 'bn');
    }
    next();
  } catch (e) { next(e); }
});

require('./admin').register(app);
const pub = require('./public');
pub.register(app);

app.use((req, res) => pub.notFound(req, res));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[error]', req.method, req.originalUrl, err && err.stack || err);
  if (res.headersSent) return;
  res.status(500).type('html').send('<h1 style="font-family:sans-serif">500 — Something went wrong</h1><p style="font-family:sans-serif">Check the server console for details.</p>');
});

(async () => {
  try {
    await db.migrate();
    await L.load();
    // hourly housekeeping
    setInterval(() => {
      db.q(`DELETE FROM sessions WHERE expires_at < NOW()`).catch(() => {});
      db.q(`DELETE FROM events WHERE ts < NOW() - ($1 || ' days')::interval`, [String(config.analyticsKeepDays)]).catch(() => {});
    }, 3600 * 1000).unref();
    // Port: cPanel "Setup Node.js App" passes its own PORT — use it if present.
    const port = process.env.PORT || config.port;
    app.listen(port, () => {
      console.log('\n  ✔ Khabarer Khobor is running');
      console.log(`    Website : http://localhost:${port}`);
      console.log(`    Admin   : http://localhost:${port}${config.adminPath}  (first login: ${config.defaultAdmin.username} / ${config.defaultAdmin.password})\n`);
    });
  } catch (e) {
    console.error('\n  ✖ Could not start. Database problem?\n    ' + e.message);
    console.error('    → Check the "database" section in config.js and that PostgreSQL is running.\n');
    process.exit(1);
  }
})();
