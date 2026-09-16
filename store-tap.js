/* store-tap.js
 *
 * Fires AppStoreTap (Meta pixel) and app_store_tap (GA4) for every App Store
 * link on the site.
 *
 * Why this exists: until 16 September 2026 only app/index.html reported a tap
 * on the App Store button. Ten other pages linked to the store and reported
 * nothing, so a tap from the homepage, the shop, the host kit page or an RSVP
 * page was invisible to both Meta and GA. This file covers those ten. It is
 * deliberately NOT loaded on app/index.html, which has its own richer handler
 * (it also carries the ad headline and page variant); loading both would
 * double count.
 *
 * The src it reports is the ct= already on the link, which is the same token
 * Apple reports under Acquisition, Campaigns. Keeping the two in step means an
 * Apple number and a Meta number can be compared without a translation table.
 * A ?src= on the page URL wins over it, so a tagged inbound link (a QR code, an
 * ad) still gets to name itself.
 */
(function () {
  'use strict';

  var STORE = 'apps.apple.com';

  function clean(v) {
    return String(v || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  }

  function pageSrc() {
    try {
      var m = location.search.match(/[?&]src=([^&]*)/);
      return m ? clean(decodeURIComponent(m[1])) : '';
    } catch (e) {
      return '';
    }
  }

  function linkSrc(a) {
    var m = (a.getAttribute('href') || '').match(/[?&](?:amp;)?ct=([^&]*)/);
    return m ? clean(m[1]) : '';
  }

  var override = pageSrc();

  function send(a) {
    var payload = { src: override || linkSrc(a) || 'untagged', page: location.pathname };
    try { if (window.fbq) fbq('trackCustom', 'AppStoreTap', payload); } catch (e) {}
    try { if (window.gtag) gtag('event', 'app_store_tap', payload); } catch (e) {}
  }

  function wire(a) {
    if (a.getAttribute('data-store-tap') === '1') return;
    a.setAttribute('data-store-tap', '1');

    a.addEventListener('click', function (e) {
      send(a);

      /* A modified click, or one that opens a new tab, leaves this page alive,
         so the beacons send on their own. Do not interfere. */
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey ||
          (typeof e.button === 'number' && e.button !== 0) ||
          a.target === '_blank') return;

      /* The delay is the whole point. Firing the event and letting the link
         navigate in the same tick tears the page down before the pixel's
         request leaves, and the event is simply lost. That is what cost
         app/index.html all but two of its events between 11 and 13 September.
         Hold the navigation for a beat. */
      e.preventDefault();
      var url = a.href;
      var gone = false;
      var leave = function () {
        if (gone) return;
        gone = true;
        location.href = url;
      };
      setTimeout(leave, 250);
    });
  }

  function wireAll() {
    var links = document.querySelectorAll('a[href*="' + STORE + '"]');
    for (var i = 0; i < links.length; i++) wire(links[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireAll);
  } else {
    wireAll();
  }
})();
