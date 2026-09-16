/* ─────────────────────────────────────────
   Admin panels

   Each panel edits one of the files under data/ through ILYData.
   Nothing here talks to a server: panels mutate the in-memory copy
   and mark it dirty, and ILYData.save() decides how it is persisted.
   ───────────────────────────────────────── */
(function () {
  'use strict';

  var D = window.ILYData;
  var $ = function (id) { return document.getElementById(id); };

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  }

  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function toast(msg, isErr) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'adm-toast' + (isErr ? ' err' : '');
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 2600);
  }

  /* label + input bound to obj[key] */
  function field(obj, key, label, opts) {
    opts = opts || {};
    var wrap = el('div', 'adm-f');
    var id = 'f-' + Math.random().toString(36).slice(2, 8);

    var lab = el('label', null, esc(label));
    lab.setAttribute('for', id);
    wrap.appendChild(lab);

    var input;
    if (opts.textarea) {
      input = el('textarea');
      input.rows = opts.rows || 5;
    } else {
      input = el('input');
      input.type = 'text';
    }
    input.id = id;
    input.value = (opts.join && Array.isArray(obj[key]))
      ? obj[key].join('\n')
      : (obj[key] === undefined || obj[key] === null ? '' : obj[key]);
    if (opts.placeholder) input.placeholder = opts.placeholder;

    input.addEventListener('input', function () {
      if (opts.join) {
        obj[key] = input.value.split('\n')
          .map(function (l) { return l.trim(); })
          .filter(function (l) { return l; });
      } else {
        obj[key] = input.value;
      }
      D.touch();
      if (opts.onInput) opts.onInput();
    });

    wrap.appendChild(input);
    if (opts.hint) wrap.appendChild(el('div', 'adm-hint', esc(opts.hint)));
    return wrap;
  }

  /* drag-to-reorder over a container of rows, kept in sync with arr */
  function sortable(container, itemSelector, arr, onDone) {
    if (container._sortableBound) return;
    container._sortableBound = true;
    var dragging = null;

    function clearTargets() {
      container.querySelectorAll('.drop-target').forEach(function (n) {
        n.classList.remove('drop-target');
      });
    }

    container.addEventListener('dragstart', function (e) {
      var row = e.target.closest(itemSelector);
      if (!row) return;
      dragging = row;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', ''); } catch (err) {}
    });

    container.addEventListener('dragend', function () {
      if (dragging) dragging.classList.remove('dragging');
      clearTargets();
      dragging = null;
    });

    container.addEventListener('dragover', function (e) {
      if (!dragging) return;
      e.preventDefault();
      var over = e.target.closest(itemSelector);
      if (!over || over === dragging) return;
      clearTargets();
      over.classList.add('drop-target');
    });

    container.addEventListener('drop', function (e) {
      if (!dragging) return;
      e.preventDefault();
      var over = e.target.closest(itemSelector);
      if (!over || over === dragging) { clearTargets(); return; }

      var rows = Array.prototype.slice.call(container.querySelectorAll(itemSelector));
      var from = rows.indexOf(dragging);
      var to = rows.indexOf(over);
      dragging = null;
      clearTargets();
      if (from < 0 || to < 0) return;

      arr.splice(to, 0, arr.splice(from, 1)[0]);
      D.touch();
      onDone();
    });
  }

  /* ── Artists ── */
  function renderArtists() {
    var list = $('artist-list');
    var arr = D.get('artists') || [];
    list.innerHTML = '';

    arr.forEach(function (a, i) {
      var row = el('div', 'adm-item');
      row.draggable = true;

      var head = el('div', 'adm-item-head');
      head.appendChild(el('span', 'adm-handle', '&#8942;&#8942;'));
      var nameEl = el('span', 'adm-name', esc(a.name || '(unnamed)'));
      head.appendChild(nameEl);
      head.appendChild(el('span', 'adm-meta', esc(a.role || '')));

      var edit = el('button', 'adm-mini-btn', 'Edit');
      edit.addEventListener('click', function () { row.classList.toggle('open'); });
      head.appendChild(edit);

      var del = el('button', 'adm-mini-btn danger', 'Remove');
      del.addEventListener('click', function () {
        if (!confirm('Remove ' + (a.name || 'this artist') + ' from the site?')) return;
        arr.splice(i, 1);
        D.touch();
        renderArtists();
      });
      head.appendChild(del);
      row.appendChild(head);

      var body = el('div', 'adm-item-body');

      var two = el('div', 'adm-f2');
      two.appendChild(field(a, 'name', 'Name', {
        onInput: function () { nameEl.textContent = a.name || '(unnamed)'; }
      }));
      two.appendChild(field(a, 'slug', 'Slug', { hint: 'used in the link: /team/#slug' }));
      body.appendChild(two);

      var two2 = el('div', 'adm-f2');
      two2.appendChild(field(a, 'role', 'Job title', { placeholder: 'Resident Artist' }));
      two2.appendChild(field(a, 'ig', 'Instagram', { hint: 'username only, no @' }));
      body.appendChild(two2);

      body.appendChild(field(a, 'style', 'Styles', {
        placeholder: 'American Traditional · Fine Line'
      }));
      body.appendChild(field(a, 'bio', 'Bio', {
        textarea: true, rows: 6, join: true, hint: 'One paragraph per line.'
      }));

      var two3 = el('div', 'adm-f2');
      two3.appendChild(field(a, 'photo', 'Portrait file', { hint: 'a file in images/artists/' }));
      two3.appendChild(field(a, 'gallery', 'Gallery id', { hint: 'which photo set to show' }));
      body.appendChild(two3);

      row.appendChild(body);
      list.appendChild(row);
    });

    sortable(list, '.adm-item', arr, renderArtists);
  }

  /* ── Photos ── */
  var currentGallery = null;

  function renderGalleryPicker() {
    var sel = $('gallery-pick');
    sel.innerHTML = '';
    D.GALLERIES.forEach(function (g) {
      var doc = D.get('gallery:' + g);
      var count = doc ? (doc.photos || []).length : 0;
      var o = el('option', null, esc(g + '  (' + count + ')'));
      o.value = g;
      sel.appendChild(o);
    });
    if (!currentGallery) currentGallery = D.GALLERIES[0];
    sel.value = currentGallery;
    sel.onchange = function () {
      currentGallery = sel.value;
      renderPhotos();
    };
  }

  function renderPhotos() {
    var grid = $('photo-grid');
    var doc = D.get('gallery:' + currentGallery);
    grid.innerHTML = '';
    if (!doc) { $('photo-note').textContent = 'Gallery not loaded.'; return; }

    var arr = doc.photos || (doc.photos = []);

    arr.forEach(function (ph, i) {
      var src = typeof ph === 'string' ? ph : ph.src;
      var cell = el('div', 'adm-photo');
      cell.draggable = true;

      var img = el('img');
      img.src = src;
      img.loading = 'lazy';
      cell.appendChild(img);
      cell.appendChild(el('span', 'adm-photo-n', String(i + 1)));

      var x = el('button', 'adm-photo-x', '&#10005;');
      x.title = 'Remove from gallery';
      x.addEventListener('click', function (e) {
        e.stopPropagation();
        arr.splice(i, 1);
        D.touch();
        renderPhotos();
      });
      cell.appendChild(x);

      if (ph && typeof ph === 'object') {
        var cap = el('input', 'adm-photo-cap');
        cap.type = 'text';
        cap.value = ph.caption || '';
        cap.placeholder = 'caption';
        cap.addEventListener('mousedown', function (e) { e.stopPropagation(); });
        cap.addEventListener('input', function () { ph.caption = cap.value; D.touch(); });
        cell.appendChild(cap);
      }

      grid.appendChild(cell);
    });

    $('photo-note').textContent = arr.length + ' photo' + (arr.length === 1 ? '' : 's') +
      '. Reorder by dragging. Uploading new photos needs the sign-in service.';

    sortable(grid, '.adm-photo', arr, renderPhotos);
  }

  /* ── Reviews ── */
  function reviewsArray() {
    var doc = D.get('reviews');
    if (!doc) return null;
    if (Array.isArray(doc)) return doc;
    if (Array.isArray(doc.reviews)) return doc.reviews;
    if (Array.isArray(doc.items)) return doc.items;
    return null;
  }

  function renderReviews() {
    var list = $('review-list');
    list.innerHTML = '';
    var arr = reviewsArray();
    if (!arr) {
      list.appendChild(el('p', 'adm-note', 'Reviews file is not in a shape this editor recognises.'));
      return;
    }

    arr.forEach(function (r, i) {
      var nameKey = ('name' in r) ? 'name' : (('author' in r) ? 'author' : 'name');
      var textKey = ('text' in r) ? 'text' : (('body' in r) ? 'body' : (('quote' in r) ? 'quote' : 'text'));

      var row = el('div', 'adm-item open');
      row.draggable = true;
      var head = el('div', 'adm-item-head');
      head.appendChild(el('span', 'adm-handle', '&#8942;&#8942;'));
      var nameEl = el('span', 'adm-name', esc(r[nameKey] || 'Review ' + (i + 1)));
      head.appendChild(nameEl);

      var del = el('button', 'adm-mini-btn danger', 'Remove');
      del.addEventListener('click', function () {
        if (!confirm('Remove this review?')) return;
        arr.splice(i, 1); D.touch(); renderReviews();
      });
      head.appendChild(del);
      row.appendChild(head);

      var body = el('div', 'adm-item-body');
      body.appendChild(field(r, nameKey, 'Name', {
        onInput: function () { nameEl.textContent = r[nameKey] || 'Review'; }
      }));
      body.appendChild(field(r, textKey, 'Review', { textarea: true, rows: 4 }));
      row.appendChild(body);
      list.appendChild(row);
    });

    sortable(list, '.adm-item', arr, renderReviews);
  }

  /* ── Shop details ── */
  function renderShop() {
    var f = $('shop-form');
    var s = D.get('site');
    f.innerHTML = '';
    if (!s) return;

    f.appendChild(field(s, 'name', 'Shop name'));

    var two = el('div', 'adm-f2');
    two.appendChild(field(s, 'phone', 'Phone', { hint: 'the tel: link follows this automatically' }));
    two.appendChild(field(s, 'email', 'Email'));
    f.appendChild(two);

    s.address = s.address || {};
    f.appendChild(field(s.address, 'street', 'Street'));
    var three = el('div', 'adm-f2');
    three.appendChild(field(s.address, 'city', 'City'));
    three.appendChild(field(s.address, 'state', 'State'));
    f.appendChild(three);
    f.appendChild(field(s.address, 'zip', 'ZIP'));

    s.social = s.social || {};
    f.appendChild(field(s.social, 'instagram', 'Instagram URL'));
    f.appendChild(field(s.social, 'facebook', 'Facebook URL'));
    f.appendChild(field(s.social, 'googleReview', 'Google review URL'));

    f.appendChild(field(s, 'tagline', 'Tagline', { textarea: true, rows: 2 }));
  }

  /* ── Hours ── */
  function renderHours() {
    var list = $('hours-list');
    var s = D.get('site');
    list.innerHTML = '';
    if (!s || !Array.isArray(s.hours)) return;

    s.hours.forEach(function (h) {
      var row = el('div', 'adm-item open');
      var head = el('div', 'adm-item-head');
      head.appendChild(el('span', 'adm-name', esc(h.day)));

      var body = el('div', 'adm-f2');
      body.style.marginTop = '10px';
      body.style.display = h.closed ? 'none' : '';

      var toggle = el('button', 'adm-mini-btn', h.closed ? 'Closed' : 'Open');
      toggle.addEventListener('click', function () {
        h.closed = !h.closed;
        toggle.textContent = h.closed ? 'Closed' : 'Open';
        body.style.display = h.closed ? 'none' : '';
        D.touch();
      });
      head.appendChild(toggle);
      row.appendChild(head);

      body.appendChild(field(h, 'open', 'Opens', { placeholder: '12pm' }));
      body.appendChild(field(h, 'close', 'Closes', { placeholder: '7pm' }));
      row.appendChild(body);
      list.appendChild(row);
    });
  }

  /* ── Sections ── */
  function renderSections() {
    var list = $('section-list');
    var doc = D.get('sections');
    list.innerHTML = '';
    if (!doc || !Array.isArray(doc.home)) return;
    var arr = doc.home;

    arr.forEach(function (sec) {
      var row = el('div', 'adm-item');
      row.draggable = true;
      row.style.opacity = sec.visible === false ? '.5' : '';

      var head = el('div', 'adm-item-head');
      head.appendChild(el('span', 'adm-handle', '&#8942;&#8942;'));
      head.appendChild(el('span', 'adm-name', esc(sec.label || sec.id)));
      head.appendChild(el('span', 'adm-meta', esc(sec.id)));

      var vis = el('button', 'adm-mini-btn', sec.visible === false ? 'Hidden' : 'Shown');
      vis.addEventListener('click', function () {
        sec.visible = (sec.visible === false);
        vis.textContent = sec.visible === false ? 'Hidden' : 'Shown';
        row.style.opacity = sec.visible === false ? '.5' : '';
        D.touch();
      });
      head.appendChild(vis);
      row.appendChild(head);
      list.appendChild(row);
    });

    sortable(list, '.adm-item', arr, renderSections);
  }

  /* ── Theme ── */
  function renderTheme() {
    var f = $('theme-form');
    var t = D.get('theme');
    f.innerHTML = '';
    if (!t) return;

    t.colors = t.colors || {};
    var sw = el('div', 'adm-swatches');
    Object.keys(t.colors).forEach(function (k) {
      var wrap = el('div', 'adm-swatch');
      var input = el('input');
      input.type = 'color';
      input.value = /^#[0-9a-fA-F]{6}$/.test(t.colors[k]) ? t.colors[k] : '#000000';
      input.addEventListener('input', function () { t.colors[k] = input.value; D.touch(); });
      wrap.appendChild(input);
      wrap.appendChild(el('span', 'adm-swatch-name', esc(k)));
      sw.appendChild(wrap);
    });
    f.appendChild(sw);

    t.fonts = t.fonts || {};
    var fh = el('p', 'adm-sub', 'Fonts');
    fh.style.marginTop = '26px';
    f.appendChild(fh);
    ['display', 'body', 'accent'].forEach(function (k) {
      f.appendChild(field(t.fonts, k, k + ' font'));
    });
  }

  /* ── save bar ── */
  function refreshDirty() {
    var keys = D.dirtyKeys();
    var lbl = $('dirty');
    var has = keys.length > 0;
    lbl.textContent = has
      ? keys.length + ' unsaved change' + (keys.length === 1 ? '' : 's')
      : 'No unsaved changes';
    lbl.className = 'adm-dirty' + (has ? '' : ' clean');
    $('save').disabled = !has;
    $('revert').disabled = !has;
  }

  function renderAll() {
    renderArtists();
    renderPhotos();
    renderReviews();
    renderShop();
    renderHours();
    renderSections();
    renderTheme();
    refreshDirty();
  }

  function boot() {
    document.querySelectorAll('#nav button').forEach(function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('#nav button').forEach(function (x) { x.classList.remove('on'); });
        document.querySelectorAll('.adm-panel').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        $('p-' + b.getAttribute('data-panel')).classList.add('on');
      });
    });

    $('artist-add').addEventListener('click', function () {
      var arr = D.get('artists');
      if (!arr) return;
      arr.push({
        slug: '', name: 'New artist', photo: '', ig: '',
        role: 'Resident Artist', style: '', gallery: '', bio: []
      });
      D.touch();
      renderArtists();
    });

    $('review-add').addEventListener('click', function () {
      var arr = reviewsArray();
      if (!arr) return;
      arr.push({ name: '', text: '' });
      D.touch();
      renderReviews();
    });

    $('save').addEventListener('click', function () {
      $('save').disabled = true;
      D.save().then(function (res) {
        if (res.mode === 'download') {
          toast('Downloaded ' + res.count + ' file' +
                (res.count === 1 ? '' : 's') + ' - commit them to publish');
        } else if (res.mode === 'noop') {
          toast('Nothing to save');
        } else {
          toast('Saved');
        }
        refreshDirty();
      }).catch(function (e) {
        toast('Save failed: ' + e.message, true);
        refreshDirty();
      });
    });

    $('revert').addEventListener('click', function () {
      if (!confirm('Discard all unsaved changes?')) return;
      D.revert();
      renderAll();
      toast('Reverted');
    });

    D.onChange(refreshDirty);

    window.addEventListener('beforeunload', function (e) {
      if (D.isDirty()) { e.preventDefault(); e.returnValue = ''; }
    });

    D.loadAll().then(function () {
      renderGalleryPicker();
      renderAll();
    }).catch(function (e) {
      toast('Could not load site data: ' + e.message, true);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
