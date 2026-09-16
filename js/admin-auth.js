/* ─────────────────────────────────────────
   Signing in to the admin.

   Talks to the Worker in worker/. Holds the session token for the tab
   and nothing longer: closing the tab signs you out, and the token
   expires on its own after eight hours regardless.

   The panels never decide what someone may do — they only hide what
   they know will be refused. Every write is checked again by the
   service before it reaches the repo.
   ───────────────────────────────────────── */
window.ILYAuth = (function () {
  'use strict';

  var API = String(window.ILY_ADMIN_API || '').replace(/\/+$/, '');
  var STORE = 'ily-admin-token';

  var token = null;
  var user = null;
  var offline = false;          // localhost, no service configured
  var resolveReady;
  var ready = new Promise(function (res) { resolveReady = res; });

  /* The theme editor is a second page with no sign-in form of its own,
     so it asks to be told when there is no session instead. */
  var needSignIn = [];
  function onNeedsSignIn(fn) { needSignIn.push(fn); }

  function isLocal() {
    var h = location.hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '' || h === '[::1]';
  }

  /* sessionStorage can throw outright in a locked-down browser, so
     every use of it is wrapped rather than assumed */
  function remember(t) {
    token = t;
    try { t ? sessionStorage.setItem(STORE, t) : sessionStorage.removeItem(STORE); } catch (e) {}
  }
  function recall() {
    try { return sessionStorage.getItem(STORE); } catch (e) { return null; }
  }

  function call(path, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;

    return fetch(API + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
    }).then(function (res) {
      return res.text().then(function (raw) {
        var body = {};
        try { body = raw ? JSON.parse(raw) : {}; } catch (e) {}

        if (res.status === 401 && token) {
          // the session went away underneath us — a deleted account, a
          // changed password, or simply eight hours
          signOut('Your session ended. Please sign in again.');
        }
        if (!res.ok) {
          var err = new Error(body.error || ('Request failed (' + res.status + ')'));
          err.status = res.status;
          throw err;
        }
        return body;
      });
    }, function () {
      throw new Error('Could not reach the admin service. Check your connection.');
    });
  }

  /* ── the sign-in screen ── */

  function $(id) { return document.getElementById(id); }

  function showLogin(message) {
    needSignIn.forEach(function (fn) { try { fn(message || ''); } catch (e) {} });

    var gate = $('gate');
    var shell = document.querySelector('.adm-shell');
    if (shell) shell.hidden = true;
    if (!gate) return;
    gate.hidden = false;
    setError(message || '');
    var email = $('gate-email');
    if (email) email.focus();
  }

  function hideLogin() {
    var gate = $('gate');
    var shell = document.querySelector('.adm-shell');
    if (gate) gate.hidden = true;
    if (shell) shell.hidden = false;
  }

  function setError(msg) {
    var box = $('gate-error');
    if (!box) return;
    box.textContent = msg || '';
    box.hidden = !msg;
  }

  function setBusy(busy) {
    var btn = $('gate-submit');
    if (!btn) return;
    btn.disabled = busy;
    btn.textContent = busy ? 'Signing in…' : 'Sign in';
  }

  function signIn(email, password) {
    return call('/login', { method: 'POST', body: { email: email, password: password } })
      .then(function (res) {
        remember(res.token);
        user = res.user;
        return user;
      });
  }

  function signOut(message) {
    remember(null);
    user = null;
    showLogin(message || '');
  }

  /* ── what the signed-in user may touch ── */

  function isOwner() { return !!user && user.role === 'owner'; }
  function galleries() { return (user && user.galleries) || {}; }
  function ownGalleries() { return Object.keys(galleries()); }
  function canEditGallery(slug) { return isOwner() || ownGalleries().indexOf(slug) >= 0; }
  function artistSlug() { return user ? user.artist : null; }

  /* ── the things the panels call ── */

  var backend = {
    commit: function (files) {
      return call('/save', { method: 'POST', body: { files: files } })
        .then(function (res) { return { mode: 'published', count: res.files, sha: res.sha }; });
    }
  };

  function uploadPhoto(gallery, dataUrl, galleryDir, caption) {
    return call('/upload', {
      method: 'POST',
      body: { gallery: gallery, dataUrl: dataUrl, galleryDir: galleryDir, caption: caption || '' }
    });
  }

  function listUsers() { return call('/users').then(function (r) { return r.users || []; }); }
  function saveUser(rec) { return call('/users', { method: 'POST', body: rec }); }
  function removeUser(email) {
    return call('/users/' + encodeURIComponent(email), { method: 'DELETE' });
  }
  function changePassword(current, next) {
    return call('/password', { method: 'POST', body: { current: current, next: next } });
  }

  /* ── startup ──

     Three outcomes: a live service with a valid session, a live service
     wanting a password, or localhost with no service configured. The
     last one never happens on the real site, because API is set there. */
  function start() {
    if (!API) {
      if (isLocal()) {
        offline = true;
        user = previewUser();
        hideLogin();
        resolveReady(user);
        return;
      }
      showLogin('The admin service is not configured for this site yet.');
      var form = $('gate-form');
      if (form) form.hidden = true;
      return;
    }

    var saved = recall();
    if (!saved) { showLogin(''); return; }

    token = saved;
    call('/me').then(function (res) {
      user = res.user;
      hideLogin();
      resolveReady(user);
    }).catch(function () {
      remember(null);
      showLogin('');
    });
  }

  /* Local preview only. ?as=millie shows the admin the way that artist
     sees it, which is the quickest way to check what a login can reach
     before handing one out. Never reachable on the live site: API is
     set there, so this branch is not taken. */
  function previewUser() {
    var as = null;
    try { as = new URLSearchParams(location.search).get('as'); } catch (e) {}
    if (!as) {
      return { email: 'local', name: 'Local preview', role: 'owner', artist: null, galleries: {} };
    }

    var slugs = [as];
    try {
      var extra = new URLSearchParams(location.search).get('galleries');
      if (extra) slugs = extra.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    } catch (e) {}

    var galleries = {};
    slugs.forEach(function (g) { galleries[g] = null; });
    return {
      email: as + '@preview.local',
      name: as + ' (preview)',
      role: 'artist',
      artist: as,
      galleries: galleries
    };
  }

  function bindForm() {
    var form = $('gate-form');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = ($('gate-email').value || '').trim();
      var password = $('gate-password').value || '';
      if (!email || !password) { setError('Email and password, please.'); return; }

      setError('');
      setBusy(true);
      signIn(email, password).then(function (u) {
        setBusy(false);
        $('gate-password').value = '';
        hideLogin();
        resolveReady(u);
      }).catch(function (err) {
        setBusy(false);
        setError(err.message);
      });
    });
  }

  function boot() {
    bindForm();
    start();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  return {
    ready: ready,
    onNeedsSignIn: onNeedsSignIn,
    user: function () { return user; },
    isOwner: isOwner,
    isOffline: function () { return offline; },
    galleries: galleries,
    ownGalleries: ownGalleries,
    canEditGallery: canEditGallery,
    artistSlug: artistSlug,
    backend: backend,
    uploadPhoto: uploadPhoto,
    listUsers: listUsers,
    saveUser: saveUser,
    removeUser: removeUser,
    changePassword: changePassword,
    signOut: signOut
  };
})();
