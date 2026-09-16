/* ─────────────────────────────────────────
   Where the admin sign-in service lives.

   Not a secret — it is a public URL, and the service decides for
   itself who may do what. Kept in its own file so pointing the site at
   a different deployment is a one-line change.

   Set this to the Worker's URL after `wrangler deploy` prints it, or
   to a custom route such as https://admin.iloveyou.tattoo.

   While it is empty the admin only runs on localhost, in a mode that
   downloads changed files instead of publishing them.
   ───────────────────────────────────────── */
window.ILY_ADMIN_API = 'https://iloveyou-tattoo-admin.iloveyoutattoo.workers.dev';
