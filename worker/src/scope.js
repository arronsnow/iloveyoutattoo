/* ─────────────────────────────────────────
   What each signed-in user is allowed to change.

   Enforced here, on the server. The admin UI also hides things a
   user cannot touch, but that is only presentation — a determined
   user can craft any request they like, so every write is checked
   again here before it reaches the repo.

   owner   : anything
   artist  : their own gallery, their own photos, and their own entry
             in the shared artists file
   ───────────────────────────────────────── */

import { readFile } from './github.js';

export function galleryFileFor(slug) {
  return `data/galleries/${slug}.json`;
}

/* Paths an artist may write without further inspection. */
function pathAllowedForArtist(path, slug, galleryDir) {
  if (path === galleryFileFor(slug)) return true;
  if (galleryDir && path.startsWith(`images/${galleryDir}/`)) return true;
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
  const galleryDir = user.galleryDir || null;

  for (const [path, file] of Object.entries(files)) {
    if (path === 'data/artists.json') {
      if (file.encoding === 'base64') return { ok: false, why: 'artists.json must be text' };
      const verdict = await artistsFileChangeIsOwnEntryOnly(env, file.content, slug);
      if (!verdict.ok) return verdict;
      continue;
    }
    if (!pathAllowedForArtist(path, slug, galleryDir)) {
      return { ok: false, why: `not allowed to change ${path}` };
    }
  }
  return { ok: true };
}

/* Uploads land inside the artist's own photo folder, and the filename
   is rebuilt from scratch so nothing user-supplied can escape it. */
export function uploadPathFor(user, gallery, galleryDir, extension) {
  const dir = user.role === 'owner' ? galleryDir : user.galleryDir;
  if (!dir) return null;
  if (user.role !== 'owner' && gallery !== user.artist) return null;

  const safeExt = /^(jpe?g|png|webp)$/i.test(extension) ? extension.toLowerCase() : 'jpg';
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `images/${dir}/upload_${stamp}_${rand}.${safeExt}`;
}
