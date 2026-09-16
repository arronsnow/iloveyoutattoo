/* ─────────────────────────────────────────
   Create the first owner login.

   There is no sign-up page, by design — the only way an account comes
   into being is here, or from the Logins panel of someone who already
   has an owner account. So this runs once, to create Jenni's, and then
   she creates everyone else's from inside the admin.

     node scripts/make-owner.mjs jenni@example.com "Jenni"

   It asks for the password rather than taking it as an argument, so it
   does not end up in shell history. The password itself never leaves
   this machine: what goes to Cloudflare is a PBKDF2 hash and its salt,
   using exactly the parameters src/auth.js verifies against.

   Pass --print to see the record without writing it.
   ───────────────────────────────────────── */

import { webcrypto as crypto } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const ITERATIONS = 100000;   // must match src/auth.js - the Workers runtime caps this
const KEY_BITS = 256;

const [email, name] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const printOnly = process.argv.includes('--print');

if (!email || !email.includes('@')) {
  console.error('Usage: node scripts/make-owner.mjs <email> [name] [--print]');
  process.exit(1);
}

/* Read the passwords. Both come from one stdin session: opening a
   second readline over the same stream leaves the first one closed and
   the second prompt never resolves. Echo is suppressed where the
   terminal allows it, and falls back to a visible prompt where it does
   not (a piped stdin, some CI shells). */
function readSecrets(prompts) {
  const input = process.stdin;
  const canHide = input.isTTY && typeof input.setRawMode === 'function';

  if (!canHide) {
    // Lines can arrive faster than the chain registers the next handler
    // - a piped stdin delivers everything at once - so buffer them and
    // hand them out on demand rather than asking one at a time.
    const rl = createInterface({ input, output: process.stderr });
    const ready = [];
    const waiting = [];
    let ended = false;

    rl.on('line', (line) => {
      if (waiting.length) waiting.shift()(line);
      else ready.push(line);
    });
    rl.on('close', () => {
      ended = true;
      while (waiting.length) waiting.shift()('');
    });

    const nextLine = () => new Promise((resolve) => {
      if (ready.length) return resolve(ready.shift());
      if (ended) return resolve('');
      waiting.push(resolve);
    });

    return prompts
      .reduce((chain, label) => chain.then((acc) => {
        process.stderr.write(label + ' (visible) ');
        return nextLine().then((a) => acc.concat(a));
      }), Promise.resolve([]))
      .then((answers) => { rl.close(); return answers; });
  }

  input.setRawMode(true);
  input.resume();
  input.setEncoding('utf8');

  const answers = [];
  const one = (label) => new Promise((resolve) => {
    process.stderr.write(label + ' ');
    let value = '';
    const onData = (ch) => {
      if (ch === '\r' || ch === '\n' || ch === '\u0004') {
        input.removeListener('data', onData);
        process.stderr.write('\n');
        resolve(value);
        return;
      }
      if (ch === '\u0003') {            // Ctrl-C: leave the terminal as we found it
        input.setRawMode(false);
        process.stderr.write('\n');
        process.exit(130);
      }
      if (ch === '\u007f' || ch === '\b') { value = value.slice(0, -1); return; }
      value += ch;
    };
    input.on('data', onData);
  });

  return prompts
    .reduce((chain, label) => chain.then((acc) =>
      one(label).then((a) => acc.concat(a))
    ), Promise.resolve(answers))
    .then((all) => { input.setRawMode(false); input.pause(); return all; });
}

const b64u = (bytes) => Buffer.from(bytes).toString('base64url');

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, key, KEY_BITS
  );
  return { hash: b64u(bits), salt: b64u(salt) };
}

const [password, again] = await readSecrets(['Password for ' + email + ':', 'Again:']);

if (password !== again) {
  console.error('\nThose did not match. Nothing was written.');
  process.exit(1);
}
if (password.length < 10) {
  console.error('\nToo short — use at least 10 characters. Nothing was written.');
  process.exit(1);
}

const record = {
  ...(await hashPassword(password)),
  name: name || email,
  role: 'owner',
  artist: null,
  galleries: {},
  disabled: false
};

if (printOnly) {
  console.log(JSON.stringify(record));
  process.exit(0);
}

/* Written via a temp file rather than an argument: the record is long,
   and quoting JSON on a Windows command line is its own adventure. */
const dir = mkdtempSync(join(tmpdir(), 'ily-owner-'));
const file = join(dir, 'record.json');
writeFileSync(file, JSON.stringify(record), 'utf8');

try {
  const key = 'user:' + email.trim().toLowerCase();
  const args = ['kv', 'key', 'put', key, '--binding=USERS', '--remote', '--path', file];

  // On Windows, wrangler is a .cmd, and Node refuses to spawn one without a
  // shell (the fix for CVE-2024-27980). Going through the shell means
  // quoting the arguments ourselves - the temp path can contain spaces.
  const onWindows = process.platform === 'win32';
  const quote = (a) => (/[\s"^&|<>()]/.test(a) ? '"' + a.replace(/"/g, '""') + '"' : a);

  const res = onWindows
    ? spawnSync('wrangler.cmd ' + args.map(quote).join(' '), { stdio: 'inherit', shell: true })
    : spawnSync('wrangler', args, { stdio: 'inherit' });

  if (res.error) {
    console.error('\nCould not run wrangler: ' + res.error.message);
    console.error('Is it installed and on your PATH? Check with: wrangler --version');
    process.exit(1);
  }
  if (res.status !== 0) {
    console.error('\nwrangler exited with ' + res.status + '. The account was NOT created.');
    console.error('Run this from the worker/ folder, and check you are logged in: wrangler whoami');
    process.exit(res.status || 1);
  }

  console.log('\nOwner login created for ' + email + '.');
  console.log('Sign in at https://iloveyou.tattoo/admin/ and change the password there.');
} finally {
  unlinkSync(file);   // the hash is not a secret, but there is no reason to leave it lying around
}
