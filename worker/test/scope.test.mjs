/* What each role may write. Run with: npm test */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { checkWrite, uploadPathFor, cleanGalleryDir, galleriesFor } from '../src/scope.js';

const BACKSLASH = String.fromCharCode(92);

/* The team as the repo currently has it. scope.js reads this through
   the GitHub contents API, so the fetch it makes is stubbed below. */
const TEAM = [
  { slug: 'jenni',  name: 'Jenni',  role: 'Owner / Artist' },
  { slug: 'millie', name: 'Millie', role: 'Resident Artist' },
  { slug: 'zoie',   name: 'Zoie',   role: 'Piercer / Artist' }
];

const env = {
  GITHUB_OWNER: 'arronsnow',
  GITHUB_REPO: 'iloveyoutattoo',
  GITHUB_BRANCH: 'main',
  GITHUB_TOKEN: 'test'
};

beforeEach(() => {
  globalThis.fetch = async (url) => {
    if (String(url).includes('/contents/data/artists.json')) {
      return new Response(JSON.stringify({
        content: Buffer.from(JSON.stringify(TEAM), 'utf8').toString('base64')
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  };
});

const owner = { role: 'owner', email: 'jenni@example.com', artist: null, galleries: {} };

const millie = {
  role: 'artist', email: 'millie@example.com', artist: 'millie',
  galleries: { millie: 'tattoo galleries/millie' }
};

const zoie = {
  role: 'artist', email: 'zoie@example.com', artist: 'zoie',
  galleries: {
    zoie: 'tattoo galleries/zoie tattoo',
    'zoie-piercing': 'tattoo galleries/zoie piercing'
  }
};

const text = (content) => ({ content, encoding: 'utf-8' });
const image = () => ({ content: 'aGVsbG8=', encoding: 'base64' });

/* ── folder names ── */

test('a real photo folder is accepted, spaces and all', () => {
  assert.equal(cleanGalleryDir('tattoo galleries/zoie piercing'), 'tattoo galleries/zoie piercing');
  assert.equal(cleanGalleryDir('guests'), 'guests');
  assert.equal(cleanGalleryDir('/the shop/'), 'the shop');
});

test('a folder name that could escape images/ is refused', () => {
  assert.equal(cleanGalleryDir('../../.github/workflows'), null);
  assert.equal(cleanGalleryDir('a/../../b'), null);
  assert.equal(cleanGalleryDir('a//b'), null);
  assert.equal(cleanGalleryDir('a' + BACKSLASH + 'b'), null);
  assert.equal(cleanGalleryDir('a/./b'), null);
  assert.equal(cleanGalleryDir(''), null);
  assert.equal(cleanGalleryDir('   '), null);
  assert.equal(cleanGalleryDir(null), null);
  assert.equal(cleanGalleryDir(42), null);
});

test('an older single-gallery record still reads as a map', () => {
  assert.deepEqual(
    galleriesFor({ artist: 'cory', galleryDir: 'tattoo galleries/cory' }),
    { cory: 'tattoo galleries/cory' }
  );
  assert.deepEqual(galleriesFor(zoie), zoie.galleries);
  assert.deepEqual(galleriesFor(null), {});
});

/* ── the owner ── */

test('the owner may write anything', async () => {
  const verdict = await checkWrite(env, owner, {
    'data/site.json': text('{}'),
    'data/theme.json': text('{}'),
    'data/sections.json': text('{}'),
    'data/artists.json': text('[]'),
    'data/galleries/millie.json': text('{}'),
    'images/tattoo galleries/millie/x.jpg': image()
  });
  assert.equal(verdict.ok, true);
});

/* ── an artist, inside their own lane ── */

test('an artist may write their own gallery and their own photo folder', async () => {
  const verdict = await checkWrite(env, millie, {
    'data/galleries/millie.json': text('{"id":"millie","photos":[]}'),
    'images/tattoo galleries/millie/upload_x.jpg': image()
  });
  assert.equal(verdict.ok, true);
});

test('an artist with two galleries may write both', async () => {
  const verdict = await checkWrite(env, zoie, {
    'data/galleries/zoie.json': text('{}'),
    'data/galleries/zoie-piercing.json': text('{}'),
    'images/tattoo galleries/zoie piercing/upload_x.jpg': image()
  });
  assert.equal(verdict.ok, true);
});

test('an artist may edit their own entry in the shared artists file', async () => {
  const next = JSON.parse(JSON.stringify(TEAM));
  next[1].style = 'Fine line';
  next[1].bio = ['Hello.'];
  const verdict = await checkWrite(env, millie, { 'data/artists.json': text(JSON.stringify(next)) });
  assert.equal(verdict.ok, true);
});

/* ── an artist, reaching outside it ── */

test('an artist may not write another artist gallery', async () => {
  const verdict = await checkWrite(env, millie, { 'data/galleries/jenni.json': text('{}') });
  assert.equal(verdict.ok, false);
  assert.match(verdict.why, /not allowed/i);
});

test('an artist may not write the shop details, theme or section order', async () => {
  for (const path of ['data/site.json', 'data/theme.json', 'data/sections.json', 'data/reviews.json']) {
    const verdict = await checkWrite(env, millie, { [path]: text('{}') });
    assert.equal(verdict.ok, false, path + ' should be refused');
  }
});

test('an artist may not write site code', async () => {
  for (const path of ['index.html', 'js/main.js', 'css/main.css', 'CNAME', '.github/workflows/deploy.yml']) {
    const verdict = await checkWrite(env, millie, { [path]: text('x') });
    assert.equal(verdict.ok, false, path + ' should be refused');
  }
});

test('an artist may not drop photos into another folder', async () => {
  const verdict = await checkWrite(env, millie, { 'images/tattoo galleries/jenni/x.jpg': image() });
  assert.equal(verdict.ok, false);
});

test('an artist may not add, remove or reorder the team', async () => {
  const added = TEAM.concat([{ slug: 'ghost', name: 'Ghost' }]);
  assert.equal((await checkWrite(env, millie, { 'data/artists.json': text(JSON.stringify(added)) })).ok, false);

  const removed = TEAM.filter((a) => a.slug !== 'jenni');
  assert.equal((await checkWrite(env, millie, { 'data/artists.json': text(JSON.stringify(removed)) })).ok, false);

  const reordered = [TEAM[1], TEAM[0], TEAM[2]];
  assert.equal((await checkWrite(env, millie, { 'data/artists.json': text(JSON.stringify(reordered)) })).ok, false);
});

test('an artist may not edit another artist entry', async () => {
  const next = JSON.parse(JSON.stringify(TEAM));
  next[0].name = 'Not Jenni';
  const verdict = await checkWrite(env, millie, { 'data/artists.json': text(JSON.stringify(next)) });
  assert.equal(verdict.ok, false);
  assert.match(verdict.why, /jenni/);
});

test('renaming their own slug to claim another is refused', async () => {
  const next = JSON.parse(JSON.stringify(TEAM));
  next[1].slug = 'jenni';
  const verdict = await checkWrite(env, millie, { 'data/artists.json': text(JSON.stringify(next)) });
  assert.equal(verdict.ok, false);
});

test('a malformed artists file is refused rather than committed', async () => {
  const bad = [text('not json'), text('{"not":"an array"}'), image()];
  for (const file of bad) {
    assert.equal((await checkWrite(env, millie, { 'data/artists.json': file })).ok, false);
  }
});

test('one bad file poisons the whole batch', async () => {
  const verdict = await checkWrite(env, millie, {
    'data/galleries/millie.json': text('{}'),
    'data/site.json': text('{"phone":"000"}')
  });
  assert.equal(verdict.ok, false);
});

test('nobody signed in may write anything', async () => {
  assert.equal((await checkWrite(env, null, { 'data/site.json': text('{}') })).ok, false);
  assert.equal((await checkWrite(env, { role: 'artist' }, { 'data/site.json': text('{}') })).ok, false);
  assert.equal((await checkWrite(env, { role: 'nonsense' }, { 'data/site.json': text('{}') })).ok, false);
});

/* ── uploads ── */

test('an upload lands in the artist own folder under a rebuilt name', () => {
  const path = uploadPathFor(millie, 'millie', 'ignored/by/the/server', 'jpg');
  assert.match(path, /^images\/tattoo galleries\/millie\/upload_[a-z0-9_]+\.jpg$/);
});

test('an artist cannot upload to a gallery that is not theirs', () => {
  assert.equal(uploadPathFor(millie, 'jenni', 'tattoo galleries/jenni', 'jpg'), null);
  assert.equal(uploadPathFor(millie, 'guests', 'guests', 'jpg'), null);
});

test('an artist with two galleries uploads into the right one', () => {
  assert.match(uploadPathFor(zoie, 'zoie', null, 'png'), /^images\/tattoo galleries\/zoie tattoo\//);
  assert.match(uploadPathFor(zoie, 'zoie-piercing', null, 'png'), /^images\/tattoo galleries\/zoie piercing\//);
});

test('the owner names the folder but it is still validated', () => {
  assert.match(uploadPathFor(owner, 'guests', 'guests', 'webp'), /^images\/guests\/upload_/);
  assert.equal(uploadPathFor(owner, 'guests', '../.github/workflows', 'jpg'), null);
  assert.equal(uploadPathFor(owner, 'guests', null, 'jpg'), null);
});

test('the file extension cannot be used to smuggle anything', () => {
  assert.match(uploadPathFor(millie, 'millie', null, 'js'), /\.jpg$/);
  assert.match(uploadPathFor(millie, 'millie', null, '../../x'), /\.jpg$/);
  assert.match(uploadPathFor(millie, 'millie', null, 'JPEG'), /\.jpeg$/);
  assert.match(uploadPathFor(millie, 'millie', null, 'PNG'), /\.png$/);
});

test('nobody signed in cannot upload', () => {
  assert.equal(uploadPathFor(null, 'millie', 'x', 'jpg'), null);
});
