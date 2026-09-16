/* Password hashing and session tokens. Run with: npm test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { hashPassword, verifyPassword, issueToken, readToken } from '../src/auth.js';

const SECRET = 'a-long-random-testing-secret-value';

/* The Workers runtime refuses PBKDF2 above 100k iterations, and Node
   does not - so a value that passes every other test here still breaks
   every login once deployed. Asserting it is the only way this file can
   catch a runtime limit it does not itself run under. */
test('the work factor stays within what the Workers runtime allows', async () => {
  const src = await readFile(new URL('../src/auth.js', import.meta.url), 'utf8');
  const match = /const ITERATIONS = (\d+);/.exec(src);
  assert.ok(match, 'ITERATIONS not found in src/auth.js');
  const iterations = Number(match[1]);
  assert.ok(iterations <= 100000,
    `PBKDF2 iterations must be <= 100000 for Cloudflare Workers, found ${iterations}`);
  assert.ok(iterations >= 100000,
    `do not weaken below the 100000 the runtime allows, found ${iterations}`);
});

/* The bootstrap script writes records the Worker has to be able to
   verify, so its parameters cannot drift from auth.js. */
test('make-owner.mjs hashes with the same parameters as the Worker', async () => {
  const a = await readFile(new URL('../src/auth.js', import.meta.url), 'utf8');
  const b = await readFile(new URL('../scripts/make-owner.mjs', import.meta.url), 'utf8');
  assert.equal(
    /const ITERATIONS = (\d+);/.exec(a)[1],
    /const ITERATIONS = (\d+);/.exec(b)[1]
  );
  assert.equal(
    /const KEY_BITS = (\d+);/.exec(a)[1],
    /const KEY_BITS = (\d+);/.exec(b)[1]
  );
});

test('a password verifies against its own hash', async () => {
  const stored = await hashPassword('correct horse battery staple');
  assert.ok(stored.hash && stored.salt);
  assert.equal(await verifyPassword('correct horse battery staple', stored), true);
});

test('a wrong password does not verify', async () => {
  const stored = await hashPassword('correct horse battery staple');
  assert.equal(await verifyPassword('Correct horse battery staple', stored), false);
  assert.equal(await verifyPassword('', stored), false);
  assert.equal(await verifyPassword('something else', stored), false);
});

test('the same password hashes differently each time', async () => {
  const a = await hashPassword('same password');
  const b = await hashPassword('same password');
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);
});

test('verifying against a missing or malformed record is false, not a throw', async () => {
  assert.equal(await verifyPassword('x', null), false);
  assert.equal(await verifyPassword('x', {}), false);
  assert.equal(await verifyPassword('x', { hash: 'abc' }), false);
  assert.equal(await verifyPassword('x', { salt: 'abc' }), false);
});

test('a token round-trips its claims', async () => {
  const token = await issueToken({ email: 'jenni@example.com', role: 'owner' }, SECRET);
  const claims = await readToken(token, SECRET);
  assert.equal(claims.email, 'jenni@example.com');
  assert.equal(claims.role, 'owner');
  assert.ok(claims.exp > Math.floor(Date.now() / 1000));
});

test('a token signed with another secret is rejected', async () => {
  const token = await issueToken({ email: 'jenni@example.com' }, SECRET);
  assert.equal(await readToken(token, 'a-different-secret-entirely'), null);
});

test('tampering with the payload is rejected', async () => {
  const token = await issueToken({ email: 'artist@example.com', role: 'artist' }, SECRET);
  const [data, sig] = token.split('.');
  const body = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  body.role = 'owner';
  const forged = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
  assert.equal(await readToken(forged + '.' + sig, SECRET), null);
});

test('tampering with the signature is rejected', async () => {
  const token = await issueToken({ email: 'jenni@example.com' }, SECRET);
  const [data, sig] = token.split('.');
  const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
  assert.equal(await readToken(data + '.' + flipped, SECRET), null);
});

test('garbage is rejected rather than throwing', async () => {
  for (const bad of ['', 'nodot', '.', 'a.b', null, undefined, 42, {}]) {
    assert.equal(await readToken(bad, SECRET), null);
  }
});

test('an expired token is rejected', async () => {
  const token = await issueToken({ email: 'jenni@example.com' }, SECRET, -1);
  assert.equal(await readToken(token, SECRET), null);
});
