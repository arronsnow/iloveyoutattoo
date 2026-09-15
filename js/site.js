/* ─────────────────────────────────────────
   I Love You Tattoo - shop details runtime

   data/site.json is the single source of truth for the
   address, phone, email, socials and opening hours. Before
   this existed those values were duplicated across 19 files,
   so changing the phone number meant 19 edits.

   Any element carrying data-site is filled in from that file:

     <span data-site="phone">(865) 724-1322</span>
     <a data-site-href="phoneHref" href="tel:...">call us</a>
     <tbody data-site="hours"></tbody>

   The markup keeps its current value as fallback content, so
   if the fetch fails the page still shows correct details.
   ───────────────────────────────────────── */
(function () {
  'use strict';

  function dig(obj, path) {
    return path.split('.').reduce(function (o, k) {
      return (o === null || o === undefined) ? undefined : o[k];
    }, obj);
  }

  function addressLine(site, which) {
    var a = site.address || {};
    if (which === 'street') return a.street;
    if (which === 'cityState') return a.city + ', ' + a.state + ' ' + a.zip;
    return [a.street, a.city + ', ' + a.state + ' ' + a.zip].join(', ');
  }

  function todayName() {
    return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];
  }

  function renderHours(el, site) {
    var today = todayName();
    el.innerHTML = (site.hours || []).map(function (h) {
      var cls = h.closed ? 'closed' : 'open';
      if (h.day === today) cls += ' today';
      var when = h.closed ? 'Closed' : (h.open + ' \u2013 ' + h.close);
      return '<tr class="' + cls + '"><td>' + h.day + '</td><td>' + when + '</td></tr>';
    }).join('');
  }

  /* Link targets are derived from the display values so there is only
     ever one field to edit. Storing tel:/mailto: separately meant they
     could silently drift out of sync with the number shown. */
  function derive(site) {
    if (site.phone) site.phoneHref = 'tel:' + String(site.phone).replace(/[^0-9+]/g, '');
    if (site.email) site.emailHref = 'mailto:' + site.email;
    return site;
  }

  function render(site) {
    derive(site);
    document.querySelectorAll('[data-site]').forEach(function (el) {
      var key = el.getAttribute('data-site');

      if (key === 'hours') { renderHours(el, site); return; }

      var value;
      if (key.indexOf('address.') === 0) value = addressLine(site, key.slice(8));
      else value = dig(site, key);

      if (value === undefined || value === null || value === '') return;
      el.textContent = value;
    });

    document.querySelectorAll('[data-site-href]').forEach(function (el) {
      var value = dig(site, el.getAttribute('data-site-href'));
      if (value) el.setAttribute('href', value);
    });
  }

  fetch('/data/site.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(render)
    .catch(function () { /* markup already carries correct fallback values */ });
})();
