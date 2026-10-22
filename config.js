// =====================================================================
//  KHABARER KHOBOR — CONFIGURATION (the only file you need to edit)
//  খাবারের খবর — কনফিগারেশন (শুধু এই ফাইলটি এডিট করুন)
// ---------------------------------------------------------------------
//  No .env, no .yml. Just change the values below and run:  npm start
//  Everything else (site name, logo, ads, analytics IDs, videos, menus,
//  colors, texts...) is edited from the Admin Panel:  /admin
// =====================================================================

module.exports = {
  // Port the website runs on. Visit http://localhost:3000
  port: 3000,

  // Your public website address (used for sitemap, share links, SEO).
  // Example: 'https://khabarerkhobor.com'  (no trailing slash)
  siteUrl: 'http://localhost:3000',

  // PostgreSQL database connection.
  // If the database does not exist yet, the app will try to create it
  // automatically (the user must have permission to create databases).
  database: {
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'khabarer_khobor',
    ssl: false            // set true for most cloud databases (Neon, Supabase, Render...)
  },

  // First login (created automatically on first start only).
  // CHANGE THE PASSWORD from Admin → Users after your first login!
  defaultAdmin: {
    username: 'admin',
    password: 'admin123',
    name: 'Super Admin'
  },

  // A long random secret. Change it to any random text once.
  secret: 'change-this-to-any-long-random-text-8f3k2j9x7q',

  // Set true when the site runs behind HTTPS (cookie becomes secure-only).
  https: false,

  // Admin panel URL path. You can change '/admin' to something secret.
  adminPath: '/admin',

  // Public page cache (seconds). Makes the site super fast.
  // Cache is cleared automatically whenever you save anything in admin.
  pageCacheSeconds: 60,

  // Keep analytics data for this many days (older rows are removed).
  analyticsKeepDays: 365
};
