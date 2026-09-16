/* ─────────────────────────────────────────
   I Love You Tattoo — admin sign-in service

   A single Worker that lets staff sign in with an email and password
   and publish changes to the site repo. The site itself stays a plain
   static site on GitHub Pages; this is the only moving part.

   Routes
     POST   /login          email + password  -> session token
     GET    /me             who am I
     POST   /save           publish changed JSON files
     POST   /upload         publish a photo into a gallery
     GET    /users          list staff            (owner only)
     POST   /users          create or update      (owner only)
     DELETE /users/:email   remove a login        (owner only)
     POST   /password       change your own password

   Secrets (wrangler secret put ...):
     GITHUB_TOKEN    fine-grained PAT, Contents: read+write, this repo only
     SESSION_SECRET  long random string used to sign session tokens

   Vars (wrangler.toml):
     GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH, ALLOWED_ORIGIN
   KV:
     USERS
   ───────────────────────────────────────── */

import { hashPassword, verifyPassword, issueToken, readToken } from './auth.js';
import { commitFiles, readFile } from './github.js';
import { checkWrite, uploadPathFor, galleryFileFor, cleanGalleryDir, galleriesFor } from './scope.js';

const LOGIN_MAX_ATTEMPTS = 8;
const LOGIN_WINDOW_SECONDS = 900;

function cors(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || 'https://iloveyou.tattoo',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function json(env, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(env) }
  });
}

async function currentUser(request, env) {
  const header = request.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  const claims = await readToken(token, env.SESSION_SECRET);
  if (!claims || !claims.email) return null;

  // read the record fresh so a removed or demoted account stops working
  // immediately rather than when its token happens to expire
  const record = await env.USERS.get(`user:${claims.email}`, 'json');
  if (!record || record.disabled) return null;

  return {
    email: claims.email,
    name: record.name || claims.email,
    role: record.role,
    artist: record.artist || null,
    galleries: galleriesFor(record)
  };
}

/* crude but adequate: counts failures per email within a window */
async function loginBlocked(env, email) {
  const k = `fail:${email}`;
  const n = parseInt((await env.USERS.get(k)) || '0', 10);
  return n >= LOGIN_MAX_ATTEMPTS;
}
async function noteLoginFailure(env, email) {
  const k = `fail:${email}`;
  const n = parseInt((await env.USERS.get(k)) || '0', 10) + 1;
  await env.USERS.put(k, String(n), { expirationTtl: LOGIN_WINDOW_SECONDS });
}
async function clearLoginFailures(env, email) {
  await env.USERS.delete(`fail:${email}`);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(env) });
    }

    try {
      /* ── sign in ── */
      if (path === '/login' && request.method === 'POST') {
        const { email, password } = await request.json();
        const id = String(email || '').trim().toLowerCase();
        if (!id || !password) return json(env, { error: 'Email and password required' }, 400);

        if (await loginBlocked(env, id)) {
          return json(env, { error: 'Too many attempts. Try again in 15 minutes.' }, 429);
        }

        const record = await env.USERS.get(`user:${id}`, 'json');
        const ok = record && !record.disabled && await verifyPassword(password, record);
        if (!ok) {
          await noteLoginFailure(env, id);
          // same message either way: does not reveal whether the account exists
          return json(env, { error: 'Email or password is incorrect' }, 401);
        }
        await clearLoginFailures(env, id);

        const token = await issueToken(
          { email: id, role: record.role, artist: record.artist || null },
          env.SESSION_SECRET
        );
        return json(env, {
          token,
          user: {
            email: id,
            name: record.name || id,
            role: record.role,
            artist: record.artist || null,
            galleries: galleriesFor(record)
          }
        });
      }

      const user = await currentUser(request, env);

      if (path === '/me' && request.method === 'GET') {
        if (!user) return json(env, { error: 'Not signed in' }, 401);
        return json(env, { user });
      }

      /* ── publish changed files ── */
      if (path === '/save' && request.method === 'POST') {
        if (!user) return json(env, { error: 'Not signed in' }, 401);
        const { files } = await request.json();
        if (!files || typeof files !== 'object' || !Object.keys(files).length) {
          return json(env, { error: 'Nothing to save' }, 400);
        }

        const prepared = {};
        for (const [p, content] of Object.entries(files)) {
          if (typeof content !== 'string') return json(env, { error: `bad content for ${p}` }, 400);
          if (p.includes('..') || p.startsWith('/')) return json(env, { error: `bad path ${p}` }, 400);
          prepared[p] = { content, encoding: 'utf-8' };
        }

        const verdict = await checkWrite(env, user, prepared);
        if (!verdict.ok) return json(env, { error: verdict.why }, 403);

        const result = await commitFiles(
          env, prepared,
          `Site edit by ${user.name}`,
          { name: user.name, email: user.email }
        );
        return json(env, { ok: true, ...result });
      }

      /* ── publish a photo ──

         The manifest is updated here rather than by the browser. The
         stored filename is generated server-side, so the browser cannot
         know it in advance, and doing both in one commit means a photo
         is never in the repo without being in its gallery. */
      if (path === '/upload' && request.method === 'POST') {
        if (!user) return json(env, { error: 'Not signed in' }, 401);
        const { gallery, dataUrl, galleryDir, caption } = await request.json();

        if (!/^[a-z0-9-]+$/.test(String(gallery || ''))) {
          return json(env, { error: 'Unknown gallery' }, 400);
        }

        const m = /^data:image\/(jpe?g|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
        if (!m) return json(env, { error: 'Expected a JPEG, PNG or WebP image' }, 400);

        const target = uploadPathFor(user, gallery, galleryDir, m[1]);
        if (!target) return json(env, { error: 'Not allowed to upload to that gallery' }, 403);

        const manifestPath = galleryFileFor(gallery);
        const currentRaw = await readFile(env, manifestPath);
        if (currentRaw === null) return json(env, { error: 'That gallery does not exist yet' }, 404);

        let doc;
        try {
          doc = JSON.parse(currentRaw);
        } catch (e) {
          return json(env, { error: 'That gallery file is not valid JSON' }, 500);
        }
        if (!Array.isArray(doc.photos)) doc.photos = [];

        // match whatever shape the gallery already uses: guests carries
        // captions as objects, the rest are plain paths
        const usesObjects = doc.photos.length
          ? typeof doc.photos[0] === 'object'
          : typeof caption === 'string' && caption !== '';
        doc.photos.push(usesObjects
          ? { src: '/' + target, caption: typeof caption === 'string' ? caption : '' }
          : '/' + target);

        const files = {
          [target]: { content: m[2], encoding: 'base64' },
          [manifestPath]: { content: JSON.stringify(doc, null, 2) + '\n', encoding: 'utf-8' }
        };

        // check what is really being written, including the image itself
        const verdict = await checkWrite(env, user, files);
        if (!verdict.ok) return json(env, { error: verdict.why }, 403);

        const result = await commitFiles(
          env, files,
          `Photo added to ${gallery} by ${user.name}`,
          { name: user.name, email: user.email }
        );
        return json(env, { ok: true, path: '/' + target, photos: doc.photos, ...result });
      }

      /* ── manage logins (owner only) ── */
      if (path === '/users' && request.method === 'GET') {
        if (!user || user.role !== 'owner') return json(env, { error: 'Not allowed' }, 403);
        const list = await env.USERS.list({ prefix: 'user:' });
        const users = [];
        for (const k of list.keys) {
          const r = await env.USERS.get(k.name, 'json');
          if (r) users.push({
            email: k.name.slice(5),
            name: r.name,
            role: r.role,
            artist: r.artist || null,
            galleries: galleriesFor(r),
            disabled: !!r.disabled
          });
        }
        return json(env, { users });
      }

      if (path === '/users' && request.method === 'POST') {
        if (!user || user.role !== 'owner') return json(env, { error: 'Not allowed' }, 403);
        const { email, password, name, role, artist, galleries } = await request.json();
        const id = String(email || '').trim().toLowerCase();
        if (!id) return json(env, { error: 'Email required' }, 400);
        if (role !== 'owner' && role !== 'artist') return json(env, { error: 'Role must be owner or artist' }, 400);

        const existing = await env.USERS.get(`user:${id}`, 'json');
        if (!existing && (!password || password.length < 10)) {
          return json(env, { error: 'New accounts need a password of at least 10 characters' }, 400);
        }
        if (password && password.length < 10) {
          return json(env, { error: 'Password must be at least 10 characters' }, 400);
        }

        if (role === 'artist' && !artist) {
          return json(env, { error: 'Pick which artist this login belongs to' }, 400);
        }

        // normalise here so a bad folder is rejected at the point it is set,
        // not silently ignored later when someone tries to upload
        const gmap = {};
        if (role === 'artist' && galleries && typeof galleries === 'object') {
          for (const [slug, dir] of Object.entries(galleries)) {
            if (!/^[a-z0-9-]+$/.test(String(slug))) {
              return json(env, { error: `Bad gallery name: ${slug}` }, 400);
            }
            const clean = cleanGalleryDir(dir);
            if (!clean) return json(env, { error: `Bad photo folder for ${slug}` }, 400);
            gmap[slug] = clean;
          }
        }

        const creds = password ? await hashPassword(password) : { hash: existing.hash, salt: existing.salt };
        await env.USERS.put(`user:${id}`, JSON.stringify({
          ...creds,
          name: name || (existing && existing.name) || id,
          role,
          artist: role === 'artist' ? artist : null,
          galleries: role === 'artist' ? gmap : {},
          disabled: false
        }));
        return json(env, { ok: true, created: !existing });
      }

      if (path.startsWith('/users/') && request.method === 'DELETE') {
        if (!user || user.role !== 'owner') return json(env, { error: 'Not allowed' }, 403);
        const target = decodeURIComponent(path.slice(7)).toLowerCase();
        if (target === user.email) return json(env, { error: 'You cannot remove your own login' }, 400);
        await env.USERS.delete(`user:${target}`);
        return json(env, { ok: true });
      }

      /* ── change own password ── */
      if (path === '/password' && request.method === 'POST') {
        if (!user) return json(env, { error: 'Not signed in' }, 401);
        const { current, next } = await request.json();
        if (!next || next.length < 10) return json(env, { error: 'New password must be at least 10 characters' }, 400);

        const record = await env.USERS.get(`user:${user.email}`, 'json');
        if (!record || !(await verifyPassword(current || '', record))) {
          return json(env, { error: 'Current password is incorrect' }, 403);
        }
        const creds = await hashPassword(next);
        await env.USERS.put(`user:${user.email}`, JSON.stringify({ ...record, ...creds }));
        return json(env, { ok: true });
      }

      return json(env, { error: 'Not found' }, 404);
    } catch (err) {
      // never echo the raw error to the browser: it can contain repo
      // paths or GitHub responses
      console.error('worker error', err && err.stack || err);
      return json(env, { error: 'Something went wrong. Try again.' }, 500);
    }
  }
};
