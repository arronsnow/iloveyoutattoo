/* ─────────────────────────────────────────
   Logins, and your own password.

   Jenni (and anyone else with the owner role) can create an account for
   an artist, say which galleries it covers, and remove it again. The
   service enforces all of that; this is just the form.
   ───────────────────────────────────────── */
(function () {
  'use strict';

  var D = window.ILYData;
  var A = window.ILYAuth;
  var $ = function (id) { return document.getElementById(id); };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function toast(msg, isErr) {
    if (window.ILYAdminToast) window.ILYAdminToast(msg, isErr);
  }

  /*
    Which folder a gallery's photos live in, read from the gallery
    itself rather than typed by hand — the folders have names like
    "tattoo galleries/zoie piercing" and nobody should have to
    remember that.
  */
  function folderFor(slug) {
    var doc = D.get('gallery:' + slug);
    var first = doc && doc.photos && doc.photos[0];
    var src = typeof first === 'string' ? first : (first && first.src);
    if (!src) return null;
    var m = /^\/images\/(.+)\/[^/]+$/.exec(src);
    return m ? m[1] : null;
  }

  function labelledInput(parent, label, type, value, hint) {
    var wrap = el('div', 'adm-f');
    var id = 'u-' + Math.random().toString(36).slice(2, 8);
    var lab = el('label', null, label);
    lab.setAttribute('for', id);
    wrap.appendChild(lab);
    var input = el('input');
    input.id = id;
    input.type = type;
    input.value = value || '';
    if (type === 'password') input.autocomplete = 'new-password';
    wrap.appendChild(input);
    if (hint) wrap.appendChild(el('div', 'adm-hint', hint));
    parent.appendChild(wrap);
    return input;
  }

  /* ── the list of accounts ── */

  function renderUsers() {
    var list = $('user-list');
    if (!list) return;
    list.innerHTML = '';
    list.appendChild(el('p', 'adm-note', 'Loading…'));

    A.listUsers().then(function (users) {
      list.innerHTML = '';
      if (!users.length) {
        list.appendChild(el('p', 'adm-note', 'No logins yet.'));
        return;
      }

      users.sort(function (a, b) {
        if (a.role !== b.role) return a.role === 'owner' ? -1 : 1;
        return String(a.name || a.email).localeCompare(String(b.name || b.email));
      });

      users.forEach(function (u) {
        var row = el('div', 'adm-item open');

        var head = el('div', 'adm-item-head');
        head.appendChild(el('span', 'adm-name', u.name || u.email));
        head.appendChild(el('span', 'adm-meta',
          u.role === 'owner' ? 'Full access' : ('Artist · ' + (u.artist || 'unassigned'))));

        var me = A.user() && A.user().email === u.email;
        if (!me) {
          var del = el('button', 'adm-mini-btn danger', 'Remove');
          del.addEventListener('click', function () {
            if (!confirm('Remove the login for ' + (u.name || u.email) + '?\n\nThey will not be able to sign in again.')) return;
            del.disabled = true;
            A.removeUser(u.email).then(function () {
              toast('Login removed');
              renderUsers();
            }).catch(function (e) {
              del.disabled = false;
              toast(e.message, true);
            });
          });
          head.appendChild(del);
        }
        row.appendChild(head);

        var body = el('div', 'adm-item-body');
        body.appendChild(el('div', 'adm-hint', u.email + (me ? '  (that is you)' : '')));
        var gal = Object.keys(u.galleries || {});
        if (u.role === 'artist') {
          body.appendChild(el('div', 'adm-hint',
            gal.length ? 'Galleries: ' + gal.join(', ') : 'No galleries assigned yet'));
        }

        var reset = el('button', 'adm-mini-btn', 'Set a new password');
        reset.style.marginTop = '8px';
        reset.addEventListener('click', function () {
          openForm(u);
        });
        body.appendChild(reset);

        row.appendChild(body);
        list.appendChild(row);
      });
    }).catch(function (e) {
      list.innerHTML = '';
      list.appendChild(el('p', 'adm-note', 'Could not load logins: ' + e.message));
    });
  }

  /* ── create or update one account ── */

  function openForm(existing) {
    var host = $('user-form');
    if (!host) return;
    host.innerHTML = '';
    host.hidden = false;

    var editing = !!existing;
    host.appendChild(el('h3', null, editing ? ('Edit ' + (existing.name || existing.email)) : 'New login'));

    var emailInput = labelledInput(host, 'Email', 'email', editing ? existing.email : '',
      editing ? 'The email cannot be changed. Remove the login and make a new one instead.' : 'They sign in with this.');
    if (editing) emailInput.disabled = true;

    var nameInput = labelledInput(host, 'Name', 'text', editing ? existing.name : '');

    var pwInput = labelledInput(host, editing ? 'New password' : 'Password', 'password', '',
      editing ? 'Leave blank to keep the current one. At least 10 characters.' : 'At least 10 characters. Tell them in person, not by email.');

    /* role */
    var roleWrap = el('div', 'adm-f');
    roleWrap.appendChild(el('label', null, 'Access'));
    var roleSel = el('select');
    [['artist', 'Artist — their own gallery and profile'],
     ['owner', 'Full access — everything, including logins']].forEach(function (pair) {
      var o = el('option', null, pair[1]);
      o.value = pair[0];
      roleSel.appendChild(o);
    });
    roleSel.value = editing ? existing.role : 'artist';
    roleWrap.appendChild(roleSel);
    host.appendChild(roleWrap);

    /* which artist, and which galleries */
    var artistWrap = el('div', 'adm-f');
    artistWrap.appendChild(el('label', null, 'Which artist'));
    var artistSel = el('select');
    (D.get('artists') || []).forEach(function (a) {
      var o = el('option', null, (a.name || a.slug) + '  (' + a.slug + ')');
      o.value = a.slug;
      artistSel.appendChild(o);
    });
    artistSel.value = editing ? (existing.artist || '') : '';
    artistWrap.appendChild(artistSel);
    artistWrap.appendChild(el('div', 'adm-hint', 'Their entry on the team page. They can edit this one and no other.'));
    host.appendChild(artistWrap);

    var galWrap = el('div', 'adm-f');
    galWrap.appendChild(el('label', null, 'Galleries they look after'));
    var galBox = el('div', 'adm-checks');
    var boxes = {};
    D.GALLERIES.forEach(function (g) {
      var folder = folderFor(g);
      var line = el('label', 'adm-check');
      var box = el('input');
      box.type = 'checkbox';
      box.value = g;
      box.disabled = !folder;
      box.checked = editing && existing.galleries && Object.prototype.hasOwnProperty.call(existing.galleries, g);
      boxes[g] = box;
      line.appendChild(box);
      line.appendChild(el('span', null, g + (folder ? '' : '  (no photos yet)')));
      galBox.appendChild(line);
    });
    galWrap.appendChild(galBox);
    galWrap.appendChild(el('div', 'adm-hint', 'They can add and reorder photos in these, and nothing else.'));
    host.appendChild(galWrap);

    function syncRole() {
      var artist = roleSel.value === 'artist';
      artistWrap.style.display = artist ? '' : 'none';
      galWrap.style.display = artist ? '' : 'none';
    }
    roleSel.addEventListener('change', syncRole);

    /* ticking the artist ticks their own gallery, which is what you
       want nine times out of ten */
    artistSel.addEventListener('change', function () {
      if (boxes[artistSel.value] && !boxes[artistSel.value].disabled) {
        boxes[artistSel.value].checked = true;
      }
    });
    syncRole();

    var actions = el('p');
    actions.style.marginTop = '16px';
    var save = el('button', 'adm-btn primary', editing ? 'Save changes' : 'Create login');
    var cancel = el('button', 'adm-btn', 'Cancel');
    cancel.style.marginLeft = '8px';
    actions.appendChild(save);
    actions.appendChild(cancel);
    host.appendChild(actions);

    cancel.addEventListener('click', function () { host.hidden = true; host.innerHTML = ''; });

    save.addEventListener('click', function () {
      var rec = {
        email: editing ? existing.email : (emailInput.value || '').trim().toLowerCase(),
        name: (nameInput.value || '').trim(),
        role: roleSel.value
      };
      if (pwInput.value) rec.password = pwInput.value;

      if (!rec.email) { toast('An email is needed', true); return; }
      if (!editing && !rec.password) { toast('A password is needed', true); return; }

      if (rec.role === 'artist') {
        rec.artist = artistSel.value;
        if (!rec.artist) { toast('Pick which artist this is', true); return; }
        rec.galleries = {};
        Object.keys(boxes).forEach(function (g) {
          if (!boxes[g].checked) return;
          var folder = folderFor(g);
          if (folder) rec.galleries[g] = folder;
        });
      }

      save.disabled = true;
      A.saveUser(rec).then(function (res) {
        toast(res.created ? 'Login created' : 'Login updated');
        host.hidden = true;
        host.innerHTML = '';
        renderUsers();
      }).catch(function (e) {
        save.disabled = false;
        toast(e.message, true);
      });
    });
  }

  /* ── your own password ── */

  function renderAccount() {
    var host = $('account-form');
    if (!host) return;
    host.innerHTML = '';

    var u = A.user() || {};
    host.appendChild(el('p', 'adm-hint', 'Signed in as ' + (u.name || u.email) + '  ·  ' + (u.email || '')));

    if (A.isOffline()) {
      host.appendChild(el('p', 'adm-note',
        'This is the local preview, which has no accounts. Passwords are managed on the live site.'));
      return;
    }

    var cur = labelledInput(host, 'Current password', 'password', '');
    var next = labelledInput(host, 'New password', 'password', '', 'At least 10 characters.');
    var again = labelledInput(host, 'New password again', 'password', '');

    var btn = el('button', 'adm-btn primary', 'Change password');
    btn.style.marginTop = '10px';
    host.appendChild(btn);

    btn.addEventListener('click', function () {
      if (!next.value || next.value.length < 10) { toast('New password must be at least 10 characters', true); return; }
      if (next.value !== again.value) { toast('The new passwords do not match', true); return; }
      btn.disabled = true;
      A.changePassword(cur.value, next.value).then(function () {
        toast('Password changed');
        renderAccount();
      }).catch(function (e) {
        btn.disabled = false;
        toast(e.message, true);
      });
    });
  }

  window.ILYPeople = {
    renderUsers: renderUsers,
    renderAccount: renderAccount,
    openNewUser: function () { openForm(null); }
  };
})();
