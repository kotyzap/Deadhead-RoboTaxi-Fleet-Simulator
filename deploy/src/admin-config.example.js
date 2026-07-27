/* Template for deploy/src/admin-config.js, which is gitignored and never
   committed — this repo is public, and that file holds your real admin
   credentials.

   Setup:
     1. cp src/admin-config.example.js src/admin-config.js
     2. Edit the two values below in your copy.
     3. npm run deploy — wrangler bundles admin-config.js straight into the
        Worker even though git ignores it, so it reaches Cloudflare without
        ever reaching GitHub.

   Change the password later the same way: edit admin-config.js, redeploy. */
export const ADMIN_EMAIL = 'you@example.com';
export const ADMIN_PASSWORD = 'change-me';
