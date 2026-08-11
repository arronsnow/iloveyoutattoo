/* ─────────────────────────────────────────
   I Love You Tattoo - Theme runtime

   Applies theme overrides saved by the admin
   editor (admin/theme.html). Two sources:

   1. localStorage - a theme saved in THIS browser.
      Used so staff can preview changes on the real
      site before committing them.
   2. postMessage - live updates from the editor
      while its preview iframe is open.

   NOTE: localStorage is per-browser. Visitors do NOT
   see themes saved here. To ship a theme to everyone,
   export the CSS from the editor and paste it into
   the :root block of css/main.css.
   ───────────────────────────────────────── */
(function () {
  'use strict';

  var STORAGE_KEY = 'ilyt-theme';

  // Fonts the editor offers. Keyed by the family name so we can
  // build a Google Fonts URL for any of them on demand.
  var GOOGLE_FONTS = {
    'Playfair Display':   'ital,wght@0,400;0,700;1,400;1,700',
    'Cormorant Garamond': 'ital,wght@0,400;0,600;1,400',
    'Libre Baskerville':  'ital,wght@0,400;0,700;1,400',
    'DM Serif Display':   'ital@0;1',
    'Bodoni Moda':        'ital,wght@0,400;0,700;1,400',
    'Abril Fatface':      '',
    'Crimson Text':       'ital,wght@0,400;0,600;1,400',
    'Lora':               'ital,wght@0,400;0,600;1,400',
    'EB Garamond':        'ital,wght@0,400;0,600;1,400',
    'Spectral':           'ital,wght@0,300;0,400;1,400',
    'DM Sans':            'wght@300;400;500;700',
    'Inter':              'wght@300;400;500;600',
    'Work Sans':          'wght@300;400;500;600',
    'Montserrat':         'wght@300;400;500;600',
    'Karla':              'wght@300;400;500;600',
    'Jost':               'wght@300;400;500;600'
  };

  var loaded = {};

  /* Pull "Playfair Display" out of a stack like: 'Playfair Display', serif */
  function familyOf(stack) {
    var m = String(stack).match(/^\s*['"]?([^'",]+)['"]?/);
    return m ? m[1].trim() : null;
  }

  function ensureFont(stack) {
    var fam = familyOf(stack);
    if (!fam || loaded[fam] || !(fam in GOOGLE_FONTS)) return;
    loaded[fam] = true;
    var axis = GOOGLE_FONTS[fam];
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=' +
      fam.replace(/ /g, '+') + (axis ? ':' + axis : '') + '&display=swap';
    document.head.appendChild(link);
  }

  function apply(theme) {
    if (!theme) return;
    var root = document.documentElement;
    Object.keys(theme).forEach(function (key) {
      var value = theme[key];
      if (value === null || value === undefined || value === '') {
        root.style.removeProperty('--' + key);
        return;
      }
      root.style.setProperty('--' + key, value);
      if (key.indexOf('font-') === 0) ensureFont(value);
    });
  }

  function read() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch (e) {
      return null;
    }
  }

  // Apply any saved theme as early as possible to avoid a flash of
  // the default palette.
  apply(read());

  // Live preview: the editor posts the working theme on every change.
  window.addEventListener('message', function (e) {
    if (e.source !== window.parent) return;
    var data = e.data;
    if (!data || data.type !== 'ilyt-theme') return;
    if (data.reset) {
      var root = document.documentElement;
      (data.keys || []).forEach(function (k) { root.style.removeProperty('--' + k); });
    }
    apply(data.theme);
  });

  // Expose for the editor page itself.
  window.ILYTTheme = {
    apply: apply,
    read: read,
    ensureFont: ensureFont,
    fonts: GOOGLE_FONTS,
    STORAGE_KEY: STORAGE_KEY
  };
})();
