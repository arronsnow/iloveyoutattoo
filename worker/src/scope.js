/* ─────────────────────────────────────────
   What each signed-in user is allowed to change.

   Enforced here, on the server. The admin UI also hides things a
   user cannot touch, but that is only presentation — a determined
   user can craft any request they like, so every write is checked
   again here before it reaches the repo.

   owner   : anything
   artist  : the galleries assigned to them, the photo folders those
             galleries live in, and their own entry in the shared
             artists file
   ───────────────────────────────────────── */

import { readFile } from './github.js';

export function galleryFileFor(slug) {
  return `data/galleries/${slug}.json`;
}

/*
  A photo folder, relative to images/. Supplied by the client only for
  owners, so it is checked rather than trusted: no traversal, no
  absolute paths, no backslashes, and nothing but the characters the
  existing folders actually use (some contain spaces — "tattoo
  galleries/zoie piercing").
*/
export function cleanGalleryDir(dir) {
  if (typeof dir !== 'string') return null;
  const d = dir.trim().replace(/^\/+|\/+$/g, '');
  if (!d) return null;
  if (d.indexOf('//') >= 0) return null;
  // a whitelist, so a backslash or anything else exotic never reaches a path
  if (!/^[A-Za-z0-9 _./-]+$/.test(d)) return null;
  if (d.split('/').some((part) => part === '' || part === '.' || part === '..')) return null;
  return d;
}

/*
  An artist's galleries as { gallerySlug: photoFolder }.

  Accounts are stored with a `galleries` map so someone like Zoie can
  own both a tattoo and a piercing gallery, which live in different
  folders. Older single-gallery records are read too.
*/
export function galleriesFor(user) {
  if (!user) return {};
  const out = {};

  if (user.galleries && typeof user.galleries === 'object' && !Array.isArray(user.galleries)) {
    for (const [slug, dir] of Object.entries(user.galleries)) {
      if (typeof slug !== 'string' || !slug) continue;
      out[slug] = cleanGalleryDir(dir);
    }
  } else if (user.artist) {
    out[user.artist] = cleanGalleryDir(user.galleryDir);
  }

  return out;
}

/*
  Where a gallery's photos already live, read off the gallery itself.

  Better than asking the browser: it cannot be wrong, and it cannot be
  lied about. Owners can upload to any gallery precisely because this
  does not depend on their account carrying a folder for each one.
  Returns null for an empty gallery, which has nothing to learn from.
*/
export function dirFromPhotos(photos) {
  if (!Array.isArray(photos)) return null;
  for (const photo of photos) {
    const src = typeof photo === 'string' ? photo : (photo && photo.src);
    if (typeof src !== 'string') continue;
    const m = /^\/images\/(.+)\/[^/]+$/.exec(src);
    if (m) return cleanGalleryDir(m[1]);
  }
  return null;
}

/* Paths an artist may write without further inspection. */
function pathAllowedForArtist(path, galleries) {
  for (const [slug, dir] of Object.entries(galleries)) {
    if (path === galleryFileFor(slug)) return true;
    if (dir && path.startsWith(`images/${dir}/`)) return true;
  }
  return false;
}

/*
  artists.json is shared by everyone, so an artist may submit it only
  if their own entry is the single thing that changed. Compared against
  what is actually in the repo right now, not against anything the
  client claims.
*/
async function artistsFileChangeIsOwnEntryOnly(env, submittedJson, slug) {
  const currentRaw = await readFile(env, 'data/artists.json');
  if (currentRaw === null) return { ok: false, why: 'artists.json missing from repo' };

  let current, submitted;
  try {
    current = JSON.parse(currentRaw);
    submitted = JSON.parse(submittedJson);
  } catch (e) {
    return { ok: false, why: 'artists.json is not valid JSON' };
  }
  if (!Array.isArray(current) || !Array.isArray(submitted)) {
    return { ok: false, why: 'artists.json is not an array' };
  }
  if (current.length !== submitted.length) {
    return { ok: false, why: 'artists may not add or remove artists' };
  }

  for (let i = 0; i < current.length; i++) {
    const a = current[i];
    const b = submitted[i];
    if (a.slug !== b.slug) {
      return { ok: false, why: 'artists may not reorder the team' };
    }
    if (a.slug === slug) continue;                       // their own entry: free to differ
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      return { ok: false, why: `not allowed to edit ${a.slug || 'another artist'}` };
    }
  }

  const mine = submitted.find(function (x) { return x.slug === slug; });
  if (!mine) return { ok: false, why: 'your own entry is missing' };
  return { ok: true };
}

/*
  files: { path: { content, encoding } }
  Resolves { ok } or { ok:false, why } — the first refusal wins, and the
  whole save is rejected rather than partially applied.
*/
export async function checkWrite(env, user, files) {
  if (!user) return { ok: false, why: 'not signed in' };
  if (user.role === 'owner') return { ok: true };
  if (user.role !== 'artist' || !user.artist) {
    return { ok: false, why: 'account has no permissions' };
  }

  const slug = user.artist;
  const galleries = galleriesFor(user);

  for (const [path, file] of Object.entries(files)) {
    if (path === 'data/artists.json') {
      if (file.encoding === 'base64') return { ok: false, why: 'artists.json must be text' };
      const verdict = await artistsFileChangeIsOwnEntryOnly(env, file.content, slug);
      if (!verdict.ok) return verdict;
      continue;
    }
    if (!pathAllowedForArtist(path, galleries)) {
      return { ok: false, why: `not allowed to change ${path}` };
    }
  }
  return { ok: true };
}

/* Uploads land inside a folder the user owns, and the filename is
   rebuilt from scratch so nothing user-supplied can escape it. An
   artist's folder comes from their own record; only an owner may name
   one, and even then it is validated rather than trusted. */
export function uploadPathFor(user, gallery, galleryDir, extension) {
  if (!user) return null;

  let dir;
  if (user.role === 'owner') {
    // an owner may add photos anywhere, so the folder comes from the
    // gallery rather than from their account, which lists none
    dir = cleanGalleryDir(galleryDir);
  } else {
    const galleries = galleriesFor(user);
    if (!Object.prototype.hasOwnProperty.call(galleries, gallery)) return null;
    // an artist's own folder wins: it is what checkWrite will allow
    dir = galleries[gallery] || cleanGalleryDir(galleryDir);
  }
  if (!dir) return null;

  const safeExt = /^(jpe?g|png|webp)$/i.test(extension) ? extension.toLowerCase() : 'jpg';
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `images/${dir}/upload_${stamp}_${rand}.${safeExt}`;
}
