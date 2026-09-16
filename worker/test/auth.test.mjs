/* Password hashing and session tokens. Run with: npm test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, issueToken, readToken } from '../src/auth.js';

const SECRET = 'a-long-random-testing-secret-value';

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
