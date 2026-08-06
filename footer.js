/**
 * footer.js — Reusable footer injector
 * Injects the EXACT footer HTML into <div id="footer-container">.
 *
 * Dash variant (data-mini="1"): the SAME footer slides up as a bottom sheet.
 * A small persistent handle sits at bottom-center; tapping it pops the
 * original footer up. Close via the handle, tapping the scrim, or dragging
 * the sheet down on mobile. No scroll-based visibility logic.
 */
(function() {
  var FOOTER_HTML =
    '<footer><div class="container">' +
      '<div class="footer-grid">' +
        '<div class="footer-brand notranslate"><a href="/" class="nav-logo notranslate"><span class="nav-logo-icon"><img src="logo-nav.png" alt="GlbTOKEN" width="30" height="32" class="nav-logo-img" /></span><span class="logo-full notranslate"><span class="logo-glb notranslate">Glb</span><span class="logo-token notranslate">TOKEN</span></span></a><p data-i18n="footer-tagline">Global Token for AI. One balance, 100+ models, 56 providers. Pay-as-you-go.</p><div class="trust-badges notranslate"><span class="trust-badge notranslate">💳 Stripe</span><span class="trust-badge notranslate">🔶 Paystack</span><span class="trust-badge notranslate">₿ USDT</span><span class="trust-badge notranslate">₿ BTC</span></div></div>' +
        '<div class="footer-col"><h4>Product</h4><a href="pricing.html">Pricing</a><a href="models.html">Models</a><a href="apikeys.html">Docs</a></div>' +
        '<div class="footer-col"><h4>Company</h4><a href="about.html">About</a><a href="blog.html">Blog</a><a href="status.html">System Status</a></div>' +
        '<div class="footer-col"><h4>Contact</h4><a href="faq.html">FAQ</a><a href="contact.html">Contact support</a><a href="terms.html">Terms</a><a href="privacy.html">Privacy</a><a href="refund.html">Refund</a></div>' +
      '</div>' +
      '<div class="footer-bottom"><span>&copy; 2026 GlbTOKEN</span></div>' +
    '</div></footer>';

  function injectFooter() {
    var container = document.getElementById('footer-container');
    if (!container) return;

    if (container.getAttribute('data-mini') === '1') {
      injectSheetFooter(container);
      return;
    }

    container.innerHTML = FOOTER_HTML;
  }

  function injectSheetFooter(container) {
    // Same footer as every other page — slides up as a bottom sheet.
    container.innerHTML = FOOTER_HTML;
    var footer = container.querySelector('footer');
    if (footer) footer.classList.add('footer-drawer');

    // Scrim: tap anywhere outside the sheet to close it.
    var scrim = document.createElement('div');
    scrim.className = 'footer-scrim';
    scrim.id = 'footerScrim';
    scrim.setAttribute('aria-hidden', 'true');
    scrim.onclick = function() { toggleFooterSheet(); };
    container.insertBefore(scrim, container.firstChild);

    // Persistent small handle (curved top, flat base) at bottom-center.
    var handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'footer-handle';
    handle.id = 'footerHandle';
    handle.setAttribute('aria-label', 'Show footer');
    handle.setAttribute('aria-expanded', 'false');
    handle.title = 'Footer';
    handle.innerHTML =
      '<svg width="64" height="24" viewBox="0 0 96 36" aria-hidden="true">' +
        '<path class="fh-tab" d="M22 8 Q22 0 30 0 L66 0 Q74 0 74 8 L88 31 L84 35 L12 35 L9 31 Z" />' +
        '<g class="fh-chevron"><polyline points="39 23 48 12 57 23" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>' +
      '</svg>';
    handle.onclick = function() { toggleFooterSheet(); };
    container.insertBefore(handle, container.firstChild);

    // Mobile: drag down on the sheet to dismiss (bottom-sheet gesture).
    if (window.matchMedia && window.matchMedia('(max-width: 767px)').matches) {
      var drawerEl = document.querySelector('.footer-drawer');
      if (drawerEl) {
        var touchStartY = null;
        drawerEl.addEventListener('touchstart', function(e) {
          touchStartY = e.touches[0].clientY;
        }, { passive: true });
        drawerEl.addEventListener('touchmove', function(e) {
          if (!document.body.classList.contains('has-footer-open')) return;
          if (touchStartY === null) return;
          if (drawerEl.scrollTop > 0) return; // let internal scrolling win
          var dy = e.touches[0].clientY - touchStartY;
          if (dy > 24) {
            touchStartY = null;
            toggleFooterSheet();
          }
        }, { passive: true });
      }
    }
  }

  window.toggleFooterSheet = function() {
    var open = document.body.classList.toggle('has-footer-open');
    var drawer = document.querySelector('.footer-drawer');
    var handle = document.getElementById('footerHandle');
    var scrim = document.getElementById('footerScrim');
    if (open && drawer) {
      // Let the sheet's own height drive the handle/FAB lift.
      document.documentElement.style.setProperty('--footer-h', drawer.offsetHeight + 'px');
    }
    if (handle) {
      handle.classList.toggle('active', open);
      handle.setAttribute('aria-expanded', open ? 'true' : 'false');
      handle.setAttribute('aria-label', open ? 'Hide footer' : 'Show footer');
    }
    if (scrim) scrim.setAttribute('aria-hidden', open ? 'false' : 'true');
  };

  document.addEventListener('DOMContentLoaded', injectFooter);
})();
