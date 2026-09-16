/* ─────────────────────────────────────────
   Admin data layer

   Loads the JSON under data/, tracks which files the editor has
   changed, and hands them to whatever can persist them.

   Persistence is deliberately pluggable. Today there is no backend,
   so save() falls back to downloading the changed files. Once the
   sign-in service exists it sets ILYData.backend to something with
   commit(files) and every panel keeps working unchanged.
   ───────────────────────────────────────── */
window.ILYData = (function () {
  'use strict';

  var FILES = {
    artists:  'data/artists.json',
    site:     'data/site.json',
    theme:    'data/theme.json',
    sections: 'data/sections.json',
    reviews:  'data/reviews.json'
  };

  var GALLERIES = [
    'jenni', 'cory', 'skylar', 'millie', 'gia',
    'remy', 'eathan', 'zoie', 'zoie-piercing', 'guests', 'shop'
  ];

  var cache = {};      // key -> parsed JSON
  var original = {};   // key -> pristine JSON string, for dirty checks
  var listeners = [];

  function path(key) {
    if (FILES[key]) return FILES[key];
    if (key.indexOf('gallery:') === 0) return 'data/galleries/' + key.slice(8) + '.json';
    throw new Error('unknown data key: ' + key);
  }

  function fetchJSON(p) {
    return fetch('/' + p, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(p + ' -> ' + r.status);
      return r.json();
    });
  }

  function load(key) {
    if (cache[key]) return Promise.resolve(cache[key]);
    return fetchJSON(path(key)).then(function (doc) {
      cache[key] = doc;
      original[key] = JSON.stringify(doc);
      return doc;
    });
  }

  function loadAll() {
    var keys = Object.keys(FILES).concat(GALLERIES.map(function (g) { return 'gallery:' + g; }));
    return Promise.all(keys.map(function (k) {
      return load(k).catch(function (e) {
        if (window.console) console.warn('could not load', k, e.message);
        return null;
      });
    })).then(function () { return cache; });
  }

  function get(key) { return cache[key]; }

  function touch(key) {
    listeners.forEach(function (fn) { try { fn(dirtyKeys()); } catch (e) {} });
  }

  function dirtyKeys() {
    return Object.keys(cache).filter(function (k) {
      return JSON.stringify(cache[k]) !== original[k];
    });
  }

  function isDirty() { return dirtyKeys().length > 0; }
  function onChange(fn) { listeners.push(fn); }

  /* Until a backend exists, hand the changed files to the browser so
     they can be dropped into the repo. Clearly a stopgap. */
  function downloadFallback(files) {
    Object.keys(files).forEach(function (p, i) {
      setTimeout(function () {
        var blob = new Blob([files[p]], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = p.split('/').pop();
        a.click();
        URL.revokeObjectURL(a.href);
      }, i * 250);   // browsers throttle simultaneous downloads
    });
    return Promise.resolve({ mode: 'download', count: Object.keys(files).length });
  }

  function save() {
    var keys = dirtyKeys();
    if (!keys.length) return Promise.resolve({ mode: 'noop', count: 0 });

    var files = {};
    keys.forEach(function (k) {
      files[path(k)] = JSON.stringify(cache[k], null, 2) + '\n';
    });

    var send = (api.backend && typeof api.backend.commit === 'function')
      ? api.backend.commit(files)
      : downloadFallback(files);

    return Promise.resolve(send).then(function (res) {
      keys.forEach(function (k) { original[k] = JSON.stringify(cache[k]); });
      touch();
      return res || { mode: 'saved', count: keys.length };
    });
  }

  function revert() {
    Object.keys(original).forEach(function (k) { cache[k] = JSON.parse(original[k]); });
    touch();
  }

  var api = {
    FILES: FILES,
    GALLERIES: GALLERIES,
    load: load,
    loadAll: loadAll,
    get: get,
    touch: touch,
    dirtyKeys: dirtyKeys,
    isDirty: isDirty,
    onChange: onChange,
    save: save,
    revert: revert,
    path: path,
    backend: null      // set by the sign-in service
  };
  return api;
})();
