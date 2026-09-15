/* ─────────────────────────────────────────
   I Love You Tattoo - section order runtime

   data/sections.json says which sections a page shows and in
   what order. Markup tags each block with data-section="<id>",
   and everything up to the element marked data-section-end is
   treated as the reorderable region.

   Hiding a section removes it from the page but leaves it in
   the markup, so it can be switched back on without a rebuild.

   If the file is missing or malformed the page is left exactly
   as authored - the markup order is always a valid fallback.
   ───────────────────────────────────────── */
(function () {
  'use strict';

  /* /            -> home
     /about/      -> about
     /team/       -> team   */
  function pageKey() {
    var path = location.pathname.replace(/\/+$/, '');
    if (path === '' || /\/index\.html$/.test(path)) {
      var parent = path.replace(/\/index\.html$/, '');
      return parent === '' ? 'home' : parent.split('/').pop();
    }
    return path.split('/').pop() || 'home';
  }

  function apply(config) {
    var list = config && config[pageKey()];
    if (!Array.isArray(list) || !list.length) return;

    var nodes = {};
    document.querySelectorAll('[data-section]').forEach(function (el) {
      nodes[el.getAttribute('data-section')] = el;
    });
    if (!Object.keys(nodes).length) return;

    var anchor = document.querySelector('[data-section-end]');
    if (!anchor || !anchor.parentNode) return;
    var parent = anchor.parentNode;

    var seen = {};
    list.forEach(function (entry) {
      if (!entry || !entry.id) return;
      var el = nodes[entry.id];
      if (!el) return;
      seen[entry.id] = true;

      if (entry.visible === false) {
        if (el.parentNode) el.parentNode.removeChild(el);
        return;
      }
      // re-inserting in list order sorts the region as a side effect
      parent.insertBefore(el, anchor);
    });

    // a section present in the markup but absent from config keeps its
    // place rather than vanishing, so new sections are never lost
  }

  function start() {
    fetch('/data/sections.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(apply)
      .catch(function () { /* authored order stands */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
