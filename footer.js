/**
 * footer.js — Reusable footer injector
 * Injects the EXACT footer HTML into <div id="footer-container">.
 *
 * Dashboard variant: when the container has data-mini="1", the SAME full
 * footer is injected but hidden by default behind a bottom drawer. A small
 * solid trapezoid tab at bottom-center appears only when the user scrolls to
 * the bottom; clicking it pops the original footer up. Clicking anywhere on
 * the screen (scrim) or the tab again hides it.
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
      injectDashboardFooter(container);
      return;
    }

    container.innerHTML = FOOTER_HTML;
  }

  function injectDashboardFooter(container) {
    // Same footer as every other page — just hidden behind a bottom drawer.
    container.innerHTML = FOOTER_HTML;
    var footer = container.querySelector('footer');
    if (footer) footer.classList.add('footer-drawer');

    // Scrim: visual backdrop only. Clicks pass through (pointer-events none
    // on mobile so the page stays scrollable); a document-level listener
    // closes the drawer when tapping outside it.
    var scrim = document.createElement('div');
    scrim.className = 'footer-scrim';
    scrim.id = 'footerScrim';
    scrim.setAttribute('aria-hidden', 'true');
    container.insertBefore(scrim, container.firstChild);

    // Cream trapezoid tab with gold edge — wide base, narrower top, curved
    // corners; kisses the bottom edge, shown only near the bottom of the page.
    var arrow = document.createElement('button');
    arrow.type = 'button';
    arrow.className = 'footer-arrow';
    arrow.id = 'footerArrow';
    arrow.setAttribute('aria-label', 'Show footer');
    arrow.setAttribute('aria-expanded', 'false');
    arrow.title = 'Footer';
    arrow.innerHTML =
      '<svg width="80" height="30" viewBox="0 0 96 36" aria-hidden="true">' +
        '<path class="fa-tab" d="M22 8 Q22 0 30 0 L66 0 Q74 0 74 8 L88 31 L84 35 L12 35 L9 31 Z" />' +
        '<g class="fa-chevron"><polyline points="39 23 48 12 57 23" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>' +
      '</svg>';
    arrow.onclick = function() { toggleFooterDrawer(); };
    container.insertBefore(arrow, container.firstChild);

    // Close the drawer when tapping anywhere outside it (desktop + mobile).
    document.addEventListener('click', function(e) {
      if (!document.body.classList.contains('has-footer-open')) return;
      var t = e.target;
      if (t && t.closest && (t.closest('.footer-drawer') || t.closest('.footer-arrow'))) return;
      toggleFooterDrawer();
    });

    // Scroll listeners: ANY scroll on mobile dismisses the open drawer
    // (bottom-sheet behavior); elsewhere the tab visibility tracks the bottom.
    // Uses document-level capture so every scroll container is covered.
    function onPageScroll() {
      if (document.body.classList.contains('has-footer-open')) {
        if (window.matchMedia && window.matchMedia('(max-width: 767px)').matches) {
          toggleFooterDrawer();
          return;
        }
      }
      updateFooterTabVisibility();
    }
    document.addEventListener('scroll', onPageScroll, true);
    window.addEventListener('resize', updateFooterTabVisibility);

    // Mobile: swipe down on the open drawer to dismiss it (bottom-sheet).
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
            toggleFooterDrawer();
          }
        }, { passive: true });
      }
    }
    updateFooterTabVisibility();
  }

  window.updateFooterTabVisibility = function() {
    var arrow = document.getElementById('footerArrow');
    if (!arrow) return;
    if (document.body.classList.contains('has-footer-open')) {
      arrow.classList.add('show');
      return;
    }
    var nearBottom = false;
    var scroller = document.scrollingElement || document.documentElement;
    if (scroller.scrollHeight > scroller.clientHeight + 10) {
      nearBottom = (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 90);
    } else {
      var dc = document.querySelector('.dash-content');
      if (dc && dc.scrollHeight > dc.clientHeight + 10) {
        nearBottom = (dc.scrollTop + dc.clientHeight >= dc.scrollHeight - 90);
      }
    }
    arrow.classList.toggle('show', nearBottom);
  };

  window.toggleFooterDrawer = function() {
    var open = document.body.classList.toggle('has-footer-open');
    var drawer = document.querySelector('.footer-drawer');
    var arrow = document.getElementById('footerArrow');
    var scrim = document.getElementById('footerScrim');
    if (open && drawer) {
      // Let the fixed drawer's own height drive the tab/FAB lift (CSS var).
      document.documentElement.style.setProperty('--footer-h', drawer.offsetHeight + 'px');
    }
    if (arrow) {
      arrow.classList.toggle('active', open);
      arrow.setAttribute('aria-expanded', open ? 'true' : 'false');
      arrow.setAttribute('aria-label', open ? 'Hide footer' : 'Show footer');
    }
    if (scrim) scrim.setAttribute('aria-hidden', open ? 'false' : 'true');
    updateFooterTabVisibility();
  };

  document.addEventListener('DOMContentLoaded', injectFooter);
})();
