/* ─────────────────────────────────────────
   I Love You Tattoo - hidden admin entry

   Click the logo in the top-left three times quickly to open a
   login panel. Signing in unlocks the tools under /admin/.

   ⚠️  READ THIS BEFORE RELYING ON IT
   This is a static site with no server, so this check runs entirely
   in the visitor's browser. It hides the panel from ordinary
   visitors; it does NOT secure it. Anyone who views source, edits
   JavaScript, or types /admin/ straight into the address bar can get
   in regardless. Treat it as a "staff door", not a lock.

   To actually restrict /admin/, put authentication in front of it at
   the host: Netlify Identity / password-protected folder, Cloudflare
   Access, or .htaccess on Apache. See README.

   CHANGING THE PASSWORD
   The constant below is sha256("username:password"). Neither value
   appears in the source. Sign in and use "Change password" in the
   admin hub to generate a replacement line, then paste it here.
   ───────────────────────────────────────── */
(function () {
  'use strict';

  /* ─────────────────────────────────────────
     ACCOUNTS
     hash = sha256("username:password"). Neither the username's password
     nor the password itself appears here.

     roles
       owner   full access, and can manage these accounts
       admin   site tools (theme, events)
       artist  their own profile only - `slug` ties them to their entry
               in the ARTISTS list on pages/team.html

     An empty hash means the account exists but cannot sign in yet.
     Generate one from Admin → Users (owner) or Change password (self),
     then paste the regenerated block over this one.
     ───────────────────────────────────────── */
  var ACCOUNTS = [
    { user: 'arronsnow', role: 'owner', hash: '780de00608c973423ec71a0f692c71c98a8726b17037414318f07a90d85a4484' },
    { user: 'adminily', role: 'admin', hash: '80a33f4b0338c981d067e601ce18456967187ffea24c3930ef4bc92e0d72cc13' }
  ];

  var SESSION_KEY  = 'ilyt-admin-session';
  var CLICKS_NEEDED = 3;
  var CLICK_WINDOW  = 1500;   // ms to land all three
  var MAX_ATTEMPTS  = 5;
  var LOCKOUT_MS    = 30000;

  var ROLE_RANK = { artist: 1, admin: 2, owner: 3 };

  /* ── shared auth helpers (admin pages import these) ── */
  var Admin = {
    session: function () {
      try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); }
      catch (e) { return null; }
    },
    isSignedIn: function () {
      var s = Admin.session();
      return !!(s && s.ok === true);
    },
    /** the signed-in account record, or null */
    currentUser: function () {
      var s = Admin.session();
      if (!s || !s.ok) return null;
      for (var i = 0; i < ACCOUNTS.length; i++) {
        if (ACCOUNTS[i].user === s.user) return ACCOUNTS[i];
      }
      return null;
    },
    /** true if signed in at `role` or above (artist < admin < owner) */
    atLeast: function (role) {
      var u = Admin.currentUser();
      if (!u) return false;
      return (ROLE_RANK[u.role] || 0) >= (ROLE_RANK[role] || 99);
    },
    accounts: function () { return ACCOUNTS.slice(); },
    signOut: function () {
      try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
    },
    hash: function (text) {
      // crypto.subtle needs a secure context (https:// or localhost).
      if (!window.crypto || !window.crypto.subtle) {
        return Promise.reject(new Error('insecure-context'));
      }
      var bytes = new TextEncoder().encode(text);
      return window.crypto.subtle.digest('SHA-256', bytes).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) {
          return b.toString(16).padStart(2, '0');
        }).join('');
      });
    },
    ROLE_RANK: ROLE_RANK,
    SESSION_KEY: SESSION_KEY
  };
  window.ILYTAdmin = Admin;

  // Admin pages only need the helpers, not the click trigger.
  if (document.documentElement.hasAttribute('data-admin-page')) return;

  /* ── where does /admin/ live from here? ── */
  function adminPath() {
    // pages/x.html -> ../admin/ ; pages/a/b.html -> ../../admin/ ; index.html -> admin/
    var depth = location.pathname.replace(/^\/|\/$/g, '').split('/').length - 1;
    return depth > 0 ? new Array(depth + 1).join('../') + 'admin/' : 'admin/';
  }

  /* ── 3-click trigger on the logo ── */
  var clicks = 0, timer = null;

  function onLogoClick(e) {
    clicks++;
    clearTimeout(timer);
    timer = setTimeout(function () { clicks = 0; }, CLICK_WINDOW);

    if (clicks >= CLICKS_NEEDED) {
      clicks = 0;
      clearTimeout(timer);
      e.preventDefault();
      e.stopPropagation();
      if (Admin.isSignedIn()) location.href = adminPath();
      else openPanel();
    }
  }

  // Delegated from document in the CAPTURE phase. Two reasons:
  //  - no dependency on when this script runs vs. when the nav exists
  //  - capture means we see the third click before the logo's
  //    <a href="index.html"> navigates away
  function wireTrigger() {
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      if (!t.closest('.nav-logo')) return;
      onLogoClick(e);
    }, true);
  }

  /* ── login panel ── */
  var overlay = null;

  function openPanel() {
    if (overlay) return;

    overlay = document.createElement('div');
    overlay.className = 'adm-overlay';
    overlay.innerHTML =
      '<div class="adm-box" role="dialog" aria-modal="true" aria-labelledby="adm-title">' +
        '<button class="adm-x" type="button" aria-label="Close">&#10005;</button>' +
        '<div class="adm-eyebrow">Staff only</div>' +
        '<h2 class="adm-title" id="adm-title">Admin sign in</h2>' +
        '<form class="adm-form" novalidate>' +
          '<label class="adm-label" for="adm-user">Username</label>' +
          '<input class="adm-input" id="adm-user" type="text" autocomplete="username" ' +
                 'autocapitalize="none" spellcheck="false" required>' +
          '<label class="adm-label" for="adm-pass">Password</label>' +
          '<input class="adm-input" id="adm-pass" type="password" autocomplete="current-password" required>' +
          '<div class="adm-msg" id="adm-msg" role="status" aria-live="polite"></div>' +
          '<button class="adm-submit" type="submit">Sign in</button>' +
        '</form>' +
      '</div>';

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    var box  = overlay.querySelector('.adm-box');
    var form = overlay.querySelector('.adm-form');
    var msg  = overlay.querySelector('#adm-msg');
    var user = overlay.querySelector('#adm-user');
    var pass = overlay.querySelector('#adm-pass');

    setTimeout(function () { user.focus(); }, 40);

    overlay.addEventListener('click', function (e) { if (e.target === overlay) closePanel(); });
    overlay.querySelector('.adm-x').addEventListener('click', closePanel);
    document.addEventListener('keydown', onEsc, true);

    // keep tabbing inside the dialog
    box.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var f = box.querySelectorAll('button, input');
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var lock = lockoutRemaining();
      if (lock > 0) {
        show('Too many attempts. Try again in ' + Math.ceil(lock / 1000) + 's.', true);
        return;
      }
      if (!user.value || !pass.value) {
        show('Enter both a username and password.', true);
        return;
      }

      show('Checking…', false);
      var uname = user.value.trim();
      Admin.hash(uname + ':' + pass.value).then(function (h) {
        // an account with no hash set yet can never match
        var hit = null;
        for (var i = 0; i < ACCOUNTS.length; i++) {
          var a = ACCOUNTS[i];
          if (a.user === uname && a.hash && a.hash.length === 64 && a.hash === h) { hit = a; break; }
        }
        if (hit) {
          clearAttempts();
          try {
            sessionStorage.setItem(SESSION_KEY, JSON.stringify({
              ok: true, user: hit.user, role: hit.role, at: Date.now()
            }));
          } catch (e2) {}
          show('Welcome back, ' + hit.user + '. Opening the admin panel…', false);
          setTimeout(function () { location.href = adminPath(); }, 550);
        } else {
          var n = bumpAttempts();
          pass.value = '';
          pass.focus();
          show(n >= MAX_ATTEMPTS
            ? 'Too many attempts. Locked for ' + (LOCKOUT_MS / 1000) + 's.'
            : 'That combination is not recognised.', true);
        }
      }).catch(function (err) {
        show(err && err.message === 'insecure-context'
          ? 'Sign-in needs the site served over http(s), not opened as a file.'
          : 'Could not verify - ' + (err && err.message ? err.message : 'unknown error'), true);
      });
    });

    function show(text, bad) {
      msg.textContent = text;
      msg.className = 'adm-msg' + (bad ? ' bad' : '');
    }
  }

  function closePanel() {
    if (!overlay) return;
    document.removeEventListener('keydown', onEsc, true);
    overlay.remove();
    overlay = null;
    document.body.style.overflow = '';
  }

  function onEsc(e) { if (e.key === 'Escape') { e.stopPropagation(); closePanel(); } }

  /* ── crude attempt throttling (per browser, same caveat as everything else) ── */
  function attempts() {
    try { return JSON.parse(sessionStorage.getItem('ilyt-admin-tries') || '{"n":0,"t":0}'); }
    catch (e) { return { n: 0, t: 0 }; }
  }
  function bumpAttempts() {
    var a = attempts();
    a.n++; a.t = Date.now();
    try { sessionStorage.setItem('ilyt-admin-tries', JSON.stringify(a)); } catch (e) {}
    return a.n;
  }
  function clearAttempts() {
    try { sessionStorage.removeItem('ilyt-admin-tries'); } catch (e) {}
  }
  function lockoutRemaining() {
    var a = attempts();
    if (a.n < MAX_ATTEMPTS) return 0;
    var left = LOCKOUT_MS - (Date.now() - a.t);
    if (left <= 0) { clearAttempts(); return 0; }
    return left;
  }

  /* ── styles (injected so no page needs to carry them) ── */
  var css =
    '.adm-overlay{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;' +
      'justify-content:center;padding:24px;background:color-mix(in srgb,var(--shade) 88%,transparent);' +
      'backdrop-filter:blur(6px);animation:admFade .18s ease both}' +
    '@keyframes admFade{from{opacity:0}to{opacity:1}}' +
    '.adm-box{position:relative;width:min(400px,100%);background:var(--bg2);' +
      'border:1px solid var(--border);border-top:2px solid var(--gold);' +
      'padding:38px 36px 32px;animation:admUp .22s cubic-bezier(.22,1,.36,1) both}' +
    '@keyframes admUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}' +
    '.adm-x{position:absolute;top:12px;right:14px;background:none;border:none;cursor:pointer;' +
      'color:var(--muted);font-size:15px;line-height:1;padding:6px;transition:color .2s}' +
    '.adm-x:hover{color:var(--cream)}' +
    '.adm-eyebrow{font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:var(--gold);margin-bottom:10px}' +
    '.adm-title{font-family:var(--font-display);font-size:28px;font-weight:400;color:var(--cream);margin:0 0 24px}' +
    '.adm-label{display:block;font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;' +
      'color:var(--muted);margin-bottom:7px}' +
    '.adm-input{width:100%;font:inherit;font-size:14px;padding:11px 13px;margin-bottom:18px;' +
      'background:var(--bg);color:var(--text);border:1px solid var(--border);transition:border-color .2s}' +
    '.adm-input:focus{outline:none;border-color:var(--gold)}' +
    '.adm-submit{width:100%;font-family:var(--font-body);font-size:12px;font-weight:500;' +
      'letter-spacing:.14em;text-transform:uppercase;padding:13px;cursor:pointer;border:none;' +
      'background:var(--gold);color:var(--bg);transition:background .2s}' +
    '.adm-submit:hover{background:var(--gold-lt)}' +
    '.adm-msg{font-size:12.5px;color:var(--muted);min-height:18px;margin-bottom:14px}' +
    '.adm-msg.bad{color:#d9736b}'+
    '.nav-logo{cursor:pointer}';

  function inject() {
    var el = document.createElement('style');
    el.textContent = css;
    document.head.appendChild(el);
  }

  // Delegation means the trigger works whenever this runs; only the
  // <style> needs <head>, which exists from the first byte.
  wireTrigger();
  if (document.head) inject();
  else document.addEventListener('DOMContentLoaded', inject);
})();
