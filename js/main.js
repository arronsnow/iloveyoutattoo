/* I Love You Tattoo - Main JS */

// ── NAV: darken on scroll ──
const nav = document.getElementById('main-nav');
if (nav) {
  window.addEventListener('scroll', () => {
    nav.style.background = window.scrollY > 40
      ? 'rgba(10,5,0,0.99)'
      : 'rgba(18,10,2,0.97)';
  });
}

// ── NAV: hamburger toggle ──
const hamburger = document.getElementById('nav-hamburger');
const navLinks  = document.getElementById('nav-links');
if (hamburger && navLinks) {
  hamburger.addEventListener('click', () => {
    navLinks.classList.toggle('open');
  });
}

// ── HOURS: highlight today's row ──
const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const today = days[new Date().getDay()];
document.querySelectorAll('.hours-table tr').forEach(row => {
  const dayCell = row.querySelector('td');
  if (dayCell && dayCell.textContent.trim().toLowerCase() === today) {
    row.classList.add('today');
  }
});

// ── SCROLL REVEAL ──
// NB: reveal the reviews slider as a whole, never .review-card - the
// off-screen slides sit inside an overflow:hidden track, so they'd never
// intersect and would stay stuck at opacity 0 when you slide to them.
const revealEls = document.querySelectorAll('.section-title, .trust-item, .reviews-slider, .value-card, .showcase-item');
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.style.opacity = '1';
        e.target.style.transform = 'translateY(0)';
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.1 });
  revealEls.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(18px)';
    el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    observer.observe(el);
  });
}
/* ─────────────────────────────────────────
   RANDOM SHOWCASE (home)
   Each tile shows a random piece from that artist, reshuffled on every
   visit, so the homepage looks different each time. Every artist keeps
   exactly one tile so nobody is ever left off.

   Ranges come from data-lo/data-hi on each <img>. Gallery files are
   numbered contiguously, so any index in range resolves. If you add
   photos, bump data-hi on that tile in index.html.
   ───────────────────────────────────────── */
(function () {
  const grid = document.getElementById('showcase-grid');
  if (!grid) return;

  const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

  grid.querySelectorAll('img[data-folder]').forEach(img => {
    const lo = parseInt(img.dataset.lo, 10);
    const hi = parseInt(img.dataset.hi, 10);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return;
    const n = String(randInt(lo, hi)).padStart(3, '0');
    img.src = `images/tattoo galleries/${img.dataset.folder}/${img.dataset.prefix}_${n}.jpg`;
  });

  // Shuffle tile order too - the grid is uniform squares, so position
  // carries no meaning and varying it keeps the section feeling alive.
  const tiles = Array.from(grid.children);
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  tiles.forEach(t => grid.appendChild(t));
})();


/* ─────────────────────────────────────────
   REVIEWS SLIDER (home)

   Reads data/reviews.json so the list can grow to all 68 Google
   reviews without touching markup. Falls back to whatever cards are
   already in the HTML if the file is missing or fails to load, so the
   section never renders empty.

   Supports per-review avatars and attached photos - Google's public
   API provides neither, so those fields only populate if the data
   comes from a source that has them (see README).
   ───────────────────────────────────────── */
(function () {
  var root  = document.getElementById('reviews-slider');
  var track = document.getElementById('reviews-track');
  if (!root || !track) return;

  var dotsBox  = document.getElementById('rev-dots');
  var counter  = document.getElementById('rev-counter');
  var DELAY    = 6500;
  var MAX_DOTS = 8;            // beyond this, show "n / total" instead
  var reduced  = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var slides = [], dots = [], index = 0, timer = null;

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;');
  }

  function stars(n) {
    n = Math.max(0, Math.min(5, Math.round(n || 5)));
    return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
  }

  function when(iso) {
    if (!iso) return '';
    // Parse as a LOCAL date. new Date('2025-03-01') is UTC midnight, which
    // lands on Feb 28 for anyone west of Greenwich - a review would show
    // the wrong month to most of the US.
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    var d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }

  /* ── build slides from JSON ── */
  function render(data) {
    var list = (data && data.reviews) || [];
    if (!list.length) return false;

    track.innerHTML = list.map(function (r) {
      var rating = r.rating || 5;

      var avatar = r.avatar
        ? '<img class="review-avatar" src="' + esc(r.avatar) + '" alt="" loading="lazy">'
        : '';

      var photos = (r.photos && r.photos.length)
        ? '<div class="review-photos">' + r.photos.map(function (src) {
            return '<img src="' + esc(src) + '" alt="Photo from ' +
                   esc(r.author || 'a client') + '" loading="lazy" data-full="' + esc(src) + '">';
          }).join('') + '</div>'
        : '';

      var srcLabel = esc(data.source || 'Google') + ' review';
      var link = r.url
        ? '<a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + srcLabel + '</a>'
        : srcLabel;

      return '<div class="review-card" role="group" aria-roledescription="slide">' +
        '<div class="review-head">' + avatar +
          '<div class="stars" aria-label="' + rating + ' out of 5 stars">' + stars(rating) + '</div>' +
        '</div>' +
        '<p class="review-text">&ldquo;' + esc(r.text || '') + '&rdquo;</p>' +
        photos +
        '<div class="review-author">' + esc(r.author || 'Anonymous') + '</div>' +
        '<div class="review-source">' + link + '</div>' +
        (when(r.date) ? '<div class="review-date">' + esc(when(r.date)) + '</div>' : '') +
      '</div>';
    }).join('');

    // hide any avatar that fails to load, without inline handlers
    Array.prototype.forEach.call(track.querySelectorAll('.review-avatar'), function (img) {
      img.addEventListener('error', function () { img.style.display = 'none'; });
    });

    // honest count + a way through to the rest
    var foot = document.createElement('div');
    foot.className = 'reviews-foot';
    var total = data.totalCount || list.length;
    var shown = list.length;
    foot.innerHTML = (shown < total ? 'Showing ' + shown + ' of ' + total + ' reviews · ' : total + ' reviews · ') +
      '<a href="' + esc(data.profileUrl || data.reviewUrl || '#') +
      '" target="_blank" rel="noopener">Read them all on Google →</a>';
    root.appendChild(foot);

    wirePhotos();
    return true;
  }

  /* ── photo lightbox ── */
  function wirePhotos() {
    var lb  = document.getElementById('rev-lightbox');
    var img = document.getElementById('rev-lb-img');
    if (!lb || !img) return;

    track.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || t.tagName !== 'IMG' || !t.dataset.full) return;
      img.src = t.dataset.full;
      img.alt = t.alt || '';
      lb.classList.add('active');
      stop();
    });

    function close() { lb.classList.remove('active'); start(); }
    var x = document.getElementById('rev-lb-close');
    if (x) x.addEventListener('click', close);
    lb.addEventListener('click', function (e) { if (e.target === lb) close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && lb.classList.contains('active')) close();
    });
  }

  /* ── slider mechanics ── */
  function setup() {
    slides = Array.prototype.slice.call(track.children);

    if (slides.length < 2) {
      if (dotsBox) dotsBox.hidden = true;
      if (counter) counter.hidden = true;
      ['rev-prev', 'rev-next'].forEach(function (id) {
        var b = document.getElementById(id);
        if (b) b.hidden = true;
      });
      return;
    }

    // 68 dots would be unusable - switch to a counter past MAX_DOTS
    var useDots = slides.length <= MAX_DOTS;
    dotsBox.hidden = !useDots;
    counter.hidden = useDots;

    dots = [];
    dotsBox.innerHTML = '';
    if (useDots) {
      dots = slides.map(function (_, i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'rev-dot';
        b.setAttribute('aria-label', 'Review ' + (i + 1) + ' of ' + slides.length);
        b.addEventListener('click', function () { go(i); restart(); });
        dotsBox.appendChild(b);
        return b;
      });
    }

    document.getElementById('rev-next').addEventListener('click', function () { next(); restart(); });
    document.getElementById('rev-prev').addEventListener('click', function () { prev(); restart(); });

    root.addEventListener('mouseenter', stop);
    root.addEventListener('mouseleave', start);
    root.addEventListener('focusin', stop);
    root.addEventListener('focusout', start);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { stop(); } else { start(); }
    });
    root.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft')  { prev(); restart(); }
      if (e.key === 'ArrowRight') { next(); restart(); }
    });

    var x0 = null;
    root.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; stop(); }, { passive: true });
    root.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 40) { (dx < 0 ? next : prev)(); }
      x0 = null;
      start();
    }, { passive: true });

    go(0);
    start();
  }

  function go(i) {
    index = (i + slides.length) % slides.length;
    track.style.transform = 'translateX(-' + (index * 100) + '%)';
    dots.forEach(function (d, n) { d.setAttribute('aria-current', n === index ? 'true' : 'false'); });
    if (counter && !counter.hidden) {
      counter.innerHTML = '<b>' + (index + 1) + '</b> / ' + slides.length;
    }
    slides.forEach(function (s, n) {
      s.setAttribute('aria-hidden', n === index ? 'false' : 'true');
      s.inert = n !== index;
    });
  }

  function next() { go(index + 1); }
  function prev() { go(index - 1); }
  function start() { if (reduced || timer) { return; } timer = setInterval(next, DELAY); }
  function stop()  { clearInterval(timer); timer = null; }
  function restart() { stop(); start(); }

  /* ── load, then build ──
     If the fetch fails (offline, file://, missing file) the cards already
     in the HTML stay put and the slider still works. */
  // Guarded: if fetch is missing or throws outright, still run setup so the
  // hardcoded cards remain a working slider rather than a dead section.
  try {
    if (typeof fetch !== 'function') throw new Error('no fetch');
    fetch('data/reviews.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) { if (data) { render(data); } })
      .catch(function () { /* keep the fallback markup */ })
      .then(setup, setup);
  } catch (e) {
    setup();
  }
})();
