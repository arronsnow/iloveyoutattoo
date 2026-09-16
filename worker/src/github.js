/* ─────────────────────────────────────────
   Committing to the site repo.

   Uses the Git Data API rather than the simpler contents API so a
   save touching several files lands as ONE commit. The contents API
   is one commit per file, which would fire a Pages rebuild per file
   and leave the site briefly inconsistent.
   ───────────────────────────────────────── */

const API = 'https://api.github.com';

function headers(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'iloveyou-tattoo-admin',
    'Content-Type': 'application/json'
  };
}

async function gh(env, path, init = {}) {
  const res = await fetch(`${API}${path}`, { ...init, headers: headers(env.GITHUB_TOKEN) });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const err = new Error(`GitHub ${init.method || 'GET'} ${path} -> ${res.status} ${detail.slice(0, 300)}`);
    err.githubStatus = res.status;
    // Worth telling apart: a token that cannot write is a setting someone
    // has to change, not something that will come right on a retry.
    if (res.status === 401 || res.status === 403) err.configProblem = true;
    throw err;
  }
  return res.json();
}

function repoPath(env) {
  return `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}`;
}

export async function readFile(env, path) {
  const branch = env.GITHUB_BRANCH || 'main';
  const res = await fetch(
    `${API}${repoPath(env)}/contents/${encodeURI(path)}?ref=${branch}`,
    { headers: headers(env.GITHUB_TOKEN) }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`read ${path} -> ${res.status}`);
  const json = await res.json();
  return atob(json.content.replace(/\n/g, ''));
}

/*
  files: { 'data/site.json': { content, encoding } }
         encoding is 'utf-8' for text or 'base64' for binary (images).
*/
export async function commitFiles(env, files, message, author) {
  const branch = env.GITHUB_BRANCH || 'main';
  const base = repoPath(env);

  const ref = await gh(env, `${base}/git/ref/heads/${branch}`);
  const headSha = ref.object.sha;
  const headCommit = await gh(env, `${base}/git/commits/${headSha}`);

  // one blob per file
  const entries = [];
  for (const [path, file] of Object.entries(files)) {
    const blob = await gh(env, `${base}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content: file.content, encoding: file.encoding || 'utf-8' })
    });
    entries.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
  }

  const tree = await gh(env, `${base}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: headCommit.tree.sha, tree: entries })
  });

  const commit = await gh(env, `${base}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message,
      tree: tree.sha,
      parents: [headSha],
      author: author ? { name: author.name, email: author.email, date: new Date().toISOString() } : undefined
    })
  });

  // not forced: if someone else pushed meanwhile this fails rather than
  // silently discarding their work
  await gh(env, `${base}/git/refs/heads/${branch}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha, force: false })
  });

  return { sha: commit.sha, files: Object.keys(files).length };
}
